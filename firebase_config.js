// Firebase のウェブ設定（公開してよい値。秘密鍵ではない）。2026-09-18 Kyoshi がコンソールで発行。
//   プロジェクト: hub-a-nice-day（会社アカウント hubaniceday.system@gmail.com）
//   Firestore: (default) / Authentication: メール／パスワード＋メールリンク
const HUB_FIREBASE_CONFIG = {
  apiKey: "AIzaSyDEMrwN2EXd35XynDEWVrFWblyEy1Oe2IY",
  authDomain: "hub-a-nice-day.firebaseapp.com",
  projectId: "hub-a-nice-day",
  storageBucket: "hub-a-nice-day.firebasestorage.app",
  messagingSenderId: "984323417484",
  appId: "1:984323417484:web:0aa4e8f95b86f006e162a9"
};
if (typeof module !== 'undefined') module.exports = HUB_FIREBASE_CONFIG;
