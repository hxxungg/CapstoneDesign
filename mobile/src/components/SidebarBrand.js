import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import BrandMark from './BrandMark';
import { FONTS } from '../config/api';

const F = FONTS;
export const SIDEBAR_BRAND_EMAIL = 'lhgdream1@kangwon.ac.kr';

export default function SidebarBrand({ markSize = 36, nameStyle, emailStyle }) {
  return (
    <View style={styles.row}>
      <BrandMark size={markSize} />
      <View style={styles.textCol}>
        <Text style={[styles.name, nameStyle]}>AI 나침반</Text>
        <Text style={[styles.email, emailStyle]}>{SIDEBAR_BRAND_EMAIL}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  textCol: { flexShrink: 1 },
  name: { fontFamily: F.sansBold, fontSize: 16, color: '#fff', letterSpacing: -0.2 },
  email: {
    marginTop: 2,
    fontFamily: F.sans,
    fontSize: 10.5,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0.1,
  },
});
