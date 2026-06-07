import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import BrandMark from './BrandMark';
import { FONTS } from '../config/api';

const F = FONTS;
export const SIDEBAR_BRAND_EMAIL = 'lhgdream1@kangwon.ac.kr';

export default function SidebarBrand({ markSize = 36, nameStyle }) {
  return (
    <View style={styles.row}>
      <BrandMark size={markSize} />
      <Text style={[styles.name, nameStyle]}>AI 나침반</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  name: { fontFamily: F.sansBold, fontSize: 16, color: '#fff', letterSpacing: -0.2 },
});
