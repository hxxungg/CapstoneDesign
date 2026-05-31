import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { THEME } from '../config/api';
import ProfileHeaderButton from '../components/ProfileHeaderButton';

import SplashScreen from '../screens/SplashScreen';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import SocialRegisterScreen from '../screens/SocialRegisterScreen';

import AssignmentListScreen from '../screens/student/AssignmentListScreen';
import StageListScreen from '../screens/student/StageListScreen';
import BrowserScreen from '../screens/student/BrowserScreen';
import WorkScreen from '../screens/student/WorkScreen';
import EnrollScreen from '../screens/student/EnrollScreen';
import StudentSelfReportScreen from '../screens/student/StudentSelfReportScreen';

import TeacherDashboard from '../screens/teacher/TeacherDashboard';
import CreateAssignmentScreen from '../screens/teacher/CreateAssignmentScreen';
import GradingRubricScreen from '../screens/teacher/GradingRubricScreen';
import AssignmentDetailScreen from '../screens/teacher/AssignmentDetailScreen';
import CreateStageScreen from '../screens/teacher/CreateStageScreen';
import StudentLogsScreen from '../screens/teacher/StudentLogsScreen';
import AnalyticsScreen from '../screens/teacher/AnalyticsScreen';
import StudentListScreen from '../screens/teacher/StudentListScreen';
import StudentReportScreen from '../screens/teacher/StudentReportScreen';
import StudentGradingScreen from '../screens/teacher/StudentGradingScreen';

const Stack = createNativeStackNavigator();

function LoadingScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: THEME.background }}>
      <ActivityIndicator size="large" color={THEME.primary} />
    </View>
  );
}

const COMMON_HEADER_OPTIONS = {
  headerStyle: { backgroundColor: THEME.dark },
  headerTintColor: '#fff',
  headerTitleStyle: { fontWeight: '600', fontSize: 16, letterSpacing: -0.2 },
  headerTitleAlign: 'center',
};

function StudentStack() {
  return (
    <Stack.Navigator screenOptions={COMMON_HEADER_OPTIONS}>
      <Stack.Screen
        name="AssignmentList"
        component={AssignmentListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Enroll"
        component={EnrollScreen}
        options={{ title: '수행평가 참여' }}
      />
      <Stack.Screen
        name="StageList"
        component={StageListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Browser"
        component={BrowserScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="Work"
        component={WorkScreen}
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name="StudentSelfReport"
        component={StudentSelfReportScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

function TeacherStack() {
  return (
    <Stack.Navigator screenOptions={COMMON_HEADER_OPTIONS}>
      <Stack.Screen
        name="TeacherDashboard"
        component={TeacherDashboard}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CreateAssignment"
        component={CreateAssignmentScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="GradingRubric"
        component={GradingRubricScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="AssignmentDetail"
        component={AssignmentDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="CreateStage"
        component={CreateStageScreen}
        options={{ title: '단계 설정' }}
      />
      <Stack.Screen
        name="StudentLogs"
        component={StudentLogsScreen}
        options={{ title: '종합 분석 리포트' }}
      />
      <Stack.Screen
        name="Analytics"
        component={AnalyticsScreen}
        options={{ title: '종합 분석' }}
      />
      <Stack.Screen
        name="StudentList"
        component={StudentListScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="StudentReport"
        component={StudentReportScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="StudentGrading"
        component={StudentGradingScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) return <LoadingScreen />;

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!user ? (
          <>
            <Stack.Screen name="Splash" component={SplashScreen} />
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
            <Stack.Screen name="SocialRegister" component={SocialRegisterScreen} />
          </>
        ) : user.role === 'student' ? (
          <Stack.Screen name="StudentRoot" component={StudentStack} />
        ) : (
          <Stack.Screen name="TeacherRoot" component={TeacherStack} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
