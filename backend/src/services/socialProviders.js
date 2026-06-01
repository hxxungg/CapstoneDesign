const SUPPORTED_PROVIDERS = ['google', 'kakao'];

// Authorization Code → id_token 교환 (웹 Authorization Code Flow)
async function exchangeGoogleCode(code, redirectUri) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientSecret) {
    throw Object.assign(
      new Error('GOOGLE_CLIENT_SECRET이 설정되지 않았습니다.'),
      { status: 500 }
    );
  }

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    console.error('[Google Code Exchange]', data);
    throw Object.assign(
      new Error(`Google 코드 교환 실패: ${data.error_description || data.error || '알 수 없는 오류'}`),
      { status: 401 }
    );
  }
  if (!data.id_token) {
    throw Object.assign(new Error('Google id_token을 받지 못했습니다.'), { status: 401 });
  }
  return data.id_token;
}

function getAllowedGoogleClientIds() {
  return [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
  ].filter(Boolean);
}

async function verifyGoogleIdToken(idToken) {
  const allowedClientIds = getAllowedGoogleClientIds();
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
  );
  if (!res.ok) {
    throw Object.assign(new Error('유효하지 않은 Google 토큰입니다.'), { status: 401 });
  }
  const data = await res.json();
  if (allowedClientIds.length > 0 && !allowedClientIds.includes(data.aud)) {
    throw Object.assign(new Error('Google 클라이언트 ID가 일치하지 않습니다.'), { status: 401 });
  }
  if (!data.sub) {
    throw Object.assign(new Error('Google 사용자 정보를 가져올 수 없습니다.'), { status: 401 });
  }
  return {
    providerUserId: data.sub,
    email: data.email || null,
    name: data.name || (data.email ? data.email.split('@')[0] : 'Google 사용자'),
  };
}

// 카카오 Authorization Code → access_token 교환
async function exchangeKakaoCode(code, redirectUri) {
  const restApiKey = process.env.KAKAO_REST_API_KEY;
  if (!restApiKey) {
    throw Object.assign(new Error('KAKAO_REST_API_KEY가 설정되지 않았습니다.'), { status: 500 });
  }

  const bodyParams = {
    grant_type: 'authorization_code',
    client_id: restApiKey,
    redirect_uri: redirectUri,
    code,
  };

  // 카카오 콘솔에서 클라이언트 시크릿이 활성화된 경우 필요
  const clientSecret = process.env.KAKAO_CLIENT_SECRET;
  if (clientSecret) {
    bodyParams.client_secret = clientSecret;
  }

  const body = new URLSearchParams(bodyParams);

  console.log('[Kakao Code Exchange] redirect_uri:', redirectUri);
  console.log('[Kakao Code Exchange] client_secret 사용:', !!clientSecret);

  const res = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: body.toString(),
  });

  const data = await res.json();
  if (!res.ok || data.error) {
    console.error('[Kakao Code Exchange] 실패:', JSON.stringify(data));
    throw Object.assign(
      new Error(`카카오 코드 교환 실패: ${data.error_description || data.error || '알 수 없는 오류'}`),
      { status: 401 }
    );
  }
  if (!data.access_token) {
    throw Object.assign(new Error('카카오 access_token을 받지 못했습니다.'), { status: 401 });
  }
  return data.access_token;
}

async function verifyKakaoAccessToken(accessToken) {
  const res = await fetch('https://kapi.kakao.com/v2/user/me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw Object.assign(new Error('유효하지 않은 Kakao 토큰입니다.'), { status: 401 });
  }
  const data = await res.json();
  const account = data.kakao_account || {};
  const profile = account.profile || {};
  const kakaoId = String(data.id);
  // 이메일 동의 안 한 경우 내부 식별용 플레이스홀더 사용
  const email = account.email || `kakao_${kakaoId}@noemail.local`;
  return {
    providerUserId: kakaoId,
    email,
    name: profile.nickname || 'Kakao 사용자',
  };
}

// social_session_token 검증 (코드 재사용 방지용 단기 JWT)
function verifySocialSessionToken(token) {
  const JWT_SECRET = process.env.JWT_SECRET;
  try {
    const payload = require('jsonwebtoken').verify(token, JWT_SECRET);
    if (payload.type !== 'social_session') {
      throw new Error('invalid type');
    }
    return {
      providerUserId: payload.providerUserId,
      email: payload.email,
      name: payload.name,
    };
  } catch (err) {
    throw Object.assign(
      new Error('소셜 세션 토큰이 만료되었거나 유효하지 않습니다. 다시 로그인해 주세요.'),
      { status: 401 }
    );
  }
}

async function verifySocialToken(provider, { id_token, access_token, code, redirect_uri, social_session_token }) {
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    throw Object.assign(new Error('지원하지 않는 소셜 로그인입니다.'), { status: 400 });
  }

  // 단기 소셜 세션 토큰 — Google/Kakao 공통 (회원가입 2단계에서 사용)
  if (social_session_token) {
    return verifySocialSessionToken(social_session_token);
  }

  if (provider === 'google') {
    // Authorization Code Flow (웹 — 최초 로그인 시)
    if (code) {
      const resolvedRedirectUri = redirect_uri || 'http://localhost:8081';
      const exchangedIdToken = await exchangeGoogleCode(code, resolvedRedirectUri);
      return verifyGoogleIdToken(exchangedIdToken);
    }
    // ID Token Flow (네이티브)
    if (!id_token) {
      throw Object.assign(new Error('Google id_token, code 또는 social_session_token이 필요합니다.'), { status: 400 });
    }
    return verifyGoogleIdToken(id_token);
  }

  // 카카오 Authorization Code Flow (웹)
  if (code) {
    const resolvedRedirectUri = redirect_uri || 'http://localhost:8081';
    const kakaoAccessToken = await exchangeKakaoCode(code, resolvedRedirectUri);
    return verifyKakaoAccessToken(kakaoAccessToken);
  }
  if (!access_token) {
    throw Object.assign(new Error('Kakao access_token 또는 code가 필요합니다.'), { status: 400 });
  }
  return verifyKakaoAccessToken(access_token);
}

module.exports = { verifySocialToken, SUPPORTED_PROVIDERS };
