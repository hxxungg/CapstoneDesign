import React, { createContext, useContext, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authAPI } from '../services/api';
import { NATIVE_SOCIAL_ENABLED } from '../config/features';
import { isDemoAccount } from '../utils/demoAccount';

const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [masterViewMode, setMasterViewMode] = useState('teacher');

  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('auth_token');
      const storedUser = await AsyncStorage.getItem('auth_user');
      const storedViewMode = await AsyncStorage.getItem('master_view_mode');

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
      if (storedViewMode === 'student' || storedViewMode === 'teacher') {
        setMasterViewMode(storedViewMode);
      }
    } catch (err) {
      console.error('인증 정보 로드 실패:', err);
    } finally {
      setLoading(false);
    }
  };

  const persistMasterViewMode = async (mode) => {
    setMasterViewMode(mode);
    await AsyncStorage.setItem('master_view_mode', mode);
  };

  const login = async (email, password) => {
    const data = await authAPI.login(email, password);
    await AsyncStorage.setItem('auth_token', data.token);
    await AsyncStorage.setItem('auth_user', JSON.stringify(data.user));
    if (isDemoAccount(data.user)) {
      await AsyncStorage.setItem('master_view_mode', 'teacher');
      setMasterViewMode('teacher');
    }
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const register = async (registerData) => {
    const data = await authAPI.register(registerData);
    await AsyncStorage.setItem('auth_token', data.token);
    await AsyncStorage.setItem('auth_user', JSON.stringify(data.user));
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const persistSession = async (data) => {
    await AsyncStorage.setItem('auth_token', data.token);
    await AsyncStorage.setItem('auth_user', JSON.stringify(data.user));
    if (isDemoAccount(data.user)) {
      await AsyncStorage.setItem('master_view_mode', 'teacher');
      setMasterViewMode('teacher');
    }
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  /** 소셜 로그인 — 신규면 needsRegistration 반환 */
  const socialLogin = async (payload) => {
    try {
      const data = await authAPI.socialLogin(payload);
      return persistSession(data);
    } catch (err) {
      if (err.status === 422 && err.data?.needs_registration) {
        return {
          needsRegistration: true,
          provider: err.data.provider,
          social_session_token: err.data.social_session_token,
          profile: err.data.profile,
        };
      }
      throw err;
    }
  };

  const socialRegister = async (payload) => {
    const data = await authAPI.socialLogin(payload);
    return persistSession(data);
  };

  const logout = async () => {
    if (Platform.OS !== 'web' && !isExpoGo && NATIVE_SOCIAL_ENABLED) {
      try {
        const { GoogleSignin } = require('@react-native-google-signin/google-signin');
        await GoogleSignin.signOut();
      } catch (_) {}
      try {
        const { logout: kakaoLogout } = require('@react-native-seoul/kakao-login');
        await kakaoLogout();
      } catch (_) {}
    }
    await AsyncStorage.removeItem('auth_token');
    await AsyncStorage.removeItem('auth_user');
    await AsyncStorage.removeItem('master_view_mode');
    setToken(null);
    setUser(null);
    setMasterViewMode('teacher');
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      masterViewMode,
      setMasterViewMode: persistMasterViewMode,
      login,
      register,
      socialLogin,
      socialRegister,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
