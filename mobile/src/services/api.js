import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../config/api';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

apiClient.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const data = error.response?.data;
    const message = data?.error || '서버 연결에 실패했습니다.';
    const err = new Error(message);
    err.status = error.response?.status;
    err.data = data;
    return Promise.reject(err);
  }
);

// 인증
export const authAPI = {
  login: (email, password) => apiClient.post('/auth/login', { email, password }),
  register: (data) => apiClient.post('/auth/register', data),
  socialLogin: (data) => apiClient.post('/auth/social', data),
  getMe: () => apiClient.get('/auth/me'),
  getStudents: () => apiClient.get('/auth/students'),
  changePassword: (data) => apiClient.put('/auth/password', data),
  deleteAccount: () => apiClient.delete('/auth/account'),
};

// 수행평가
export const assignmentAPI = {
  getList: () => apiClient.get('/assignments'),
  getDetail: (id) => apiClient.get(`/assignments/${id}`),
  create: (data) => apiClient.post('/assignments', data),
  update: (id, data) => apiClient.put(`/assignments/${id}`, data),
  /** HTTP DELETE — 메서드명은 예약어 `delete` 회피 */
  remove: (id) => apiClient.delete(`/assignments/${id}`),
  enroll: (assignment_code) => apiClient.post('/assignments/enroll', { assignment_code }),
  updateProgress: (id, data) => apiClient.put(`/assignments/${id}/progress`, data),
  /** 학생: 단계별 작성 내용 저장 */
  saveStageWriting: (assignmentId, stageId, content) =>
    apiClient.put(`/assignments/${assignmentId}/stage-writing`, { stage_id: stageId, content }),
  getStudents: (id) => apiClient.get(`/assignments/${id}/students`),
};

// 단계
export const stageAPI = {
  create: (data) => apiClient.post('/stages', data),
  update: (id, data) => apiClient.put(`/stages/${id}`, data),
  remove: (id) => apiClient.delete(`/stages/${id}`),
  reorder: (id, new_order) => apiClient.put(`/stages/${id}/reorder`, { new_order }),
};

// 로그
export const logAPI = {
  record: (data) => apiClient.post('/logs', data),
  recordExitAttempt: (data) => apiClient.post('/logs/exit-attempt', data),
  getStudentLogs: (studentId, assignmentId) =>
    apiClient.get(`/logs/student/${studentId}/assignment/${assignmentId}`),
};

// 수행평가 (assessments — teacher_db.assessments)
export const assessmentAPI = {
  getMyInviteCode: () => apiClient.get('/assessments/invite-codes'),
  getList: () => apiClient.get('/assessments'),
  getDetail: (id) => apiClient.get(`/assessments/${id}`),
  create: (data) => apiClient.post('/assessments', data),
  remove: (id) => apiClient.delete(`/assessments/${id}`),
  removeStep: (assessmentId, stepId) => apiClient.delete(`/assessments/${assessmentId}/steps/${stepId}`),
};

// 분석
export const analyticsAPI = {
  getAssignmentAnalytics: (id) => apiClient.get(`/analytics/assignment/${id}`),
  /** 교사: 학생별 상세 + 종합 리포트(comprehensive_report) */
  getStudentAnalytics: (assignmentId, studentId) =>
    apiClient.get(`/analytics/assignment/${assignmentId}/student/${studentId}`),
};

export default apiClient;
