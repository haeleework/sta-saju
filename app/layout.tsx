import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "나의 결 | 사주 계산과 AI 해석",
  description: "기본 사주를 확인하고 Gemini로 관심 주제별 해석을 살펴보는 서비스",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
