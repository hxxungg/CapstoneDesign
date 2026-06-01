import React from 'react';
import { Image } from 'react-native';

const LOGO = require('../../assets/brand-mark.png');

/** 앱 로고 — brand-mark.png */
export default function BrandMark({ size = 36 }) {
  return (
    <Image
      source={LOGO}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityLabel="AI 나침반 로고"
    />
  );
}
