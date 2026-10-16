import Link from 'next/link';
import type { ReactNode } from 'react';
import { serverEnv } from '@/lib/util/env';

export const metadata = { title: '개인정보처리방침 · CalDrop' };

/** Bump when the content changes; users are told in-app before it takes effect. */
const EFFECTIVE_DATE = '2026년 10월 13일';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-10">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-black/[0.06]">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead className="bg-black/[0.03] text-ink">
          <tr>
            {head.map((cell) => (
              <th key={cell} className="px-3 py-2 font-medium">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]} className="border-t border-black/[0.06] align-top">
              {row.map((cell, index) => (
                <td key={index} className="px-3 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Written against what the code actually does - every claim here has a place
 * in the code that makes it true. Change both together.
 */
export default function PrivacyPage() {
  const { operatorName, contactEmail, databaseRegion } = serverEnv.legal;
  const operator = operatorName || '[운영자 이름 - OPERATOR_NAME 미설정]';
  const email = contactEmail || '[연락처 - PRIVACY_CONTACT_EMAIL 미설정]';
  const region = databaseRegion || '[리전 - DATABASE_REGION 미설정]';

  return (
    <main lang="ko" className="mx-auto w-full max-w-2xl px-5 pb-20 pt-10 sm:pt-16">
      <Link href="/" className="text-sm text-ink-faint hover:text-ink">
        &larr; CalDrop
      </Link>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">개인정보처리방침</h1>
      <p className="mt-3 text-sm text-ink-soft">
        {operator}(이하 &ldquo;운영자&rdquo;)는 CalDrop 서비스(이하 &ldquo;서비스&rdquo;)를 이용하는 분의
        개인정보를 「개인정보 보호법」에 따라 보호하며, 아래와 같이 처리합니다.
      </p>
      <p className="mt-2 text-xs text-ink-faint">시행일: {EFFECTIVE_DATE}</p>

      <Section title="1. 처리하는 개인정보 항목">
        <Table
          head={['구분', '항목', '수집 방법']}
          rows={[
            ['계정', 'Google 계정 식별자, 이메일 주소, 이름, 프로필 사진 URL, 시간대', 'Google 로그인 시'],
            ['캘린더 연동', 'Google 리프레시 토큰(암호화 저장), 권한 범위', 'Google 로그인 시'],
            [
              '캘린더 일정',
              '입력과 관련된 기간의 일정 제목·시간·장소·설명(저장하지 않고 분석에만 사용), 서비스가 만들거나 수정한 일정의 ID와 내용',
              '분석·등록 시 Google Calendar에서 조회',
            ],
            [
              '입력 내용',
              '직접 입력하거나 음성으로 받아쓴 텍스트, AI 분석 결과(제안된 일정 정보). 스크린샷·PDF는 저장하지 않으며, 중복 확인을 위한 SHA-256 해시값만 저장',
              '이용자가 입력 시',
            ],
            ['알림', '웹 푸시 구독 주소와 암호화 키', '알림을 켤 때'],
            ['결제', 'Google Play 구매 토큰, 구독 상태와 만료일, 무료 체험 종료일', '구독·체험 시'],
            ['자동 수집', '세션 쿠키, 서버 접속 기록(IP 주소, 요청 시각 등)', '서비스 이용 시'],
          ]}
        />
        <p>
          카드 번호 등 결제 수단 정보는 Google Play가 직접 처리하며 운영자는 받지 않습니다.
        </p>
        <p>
          마이크 버튼으로 하는 음성 입력은 이용자 브라우저에 내장된 음성 인식 기능(Chrome의 경우
          Google)이 처리합니다. 음성은 운영자 서버로 전송되거나 저장되지 않으며, 받아쓴 텍스트만 입력
          내용으로 처리됩니다.
        </p>
      </Section>

      <Section title="2. 처리 목적">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>회원 식별, 로그인 유지</li>
          <li>입력한 텍스트·이미지·PDF에서 일정 정보를 추출하고 Google Calendar에 등록·수정 제안</li>
          <li>이용자가 확인한 일정의 등록·수정, 되돌리기, 결과 알림 발송</li>
          <li>무료 체험 및 유료 구독 관리, 무료 체험 중복 이용 방지</li>
          <li>서비스 오류 확인, 부정 이용 방지</li>
        </ul>
        <p>광고, 마케팅, 프로파일링 목적으로는 이용하지 않습니다.</p>
      </Section>

      <Section title="3. 보유 및 이용 기간, 파기">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            모든 개인정보는 회원 탈퇴(계정 삭제) 시 지체 없이 파기합니다. 계정 삭제는{' '}
            <Link className="underline underline-offset-2" href="/account">
              계정 페이지
            </Link>
            에서 직접 할 수 있습니다.
          </li>
          <li>
            예외: 무료 체험 중복 이용을 막기 위해, 탈퇴한 Google 계정 식별자를 서버 비밀키로 일방향
            변환한 값(원래 식별자로 되돌릴 수 없음)과 체험 종료일을 탈퇴 후 1년간 보관한 뒤 파기합니다.
          </li>
          <li>스크린샷·PDF는 분석이 끝나면 즉시 폐기되며 저장되지 않습니다.</li>
          <li>서버 접속 기록은 호스팅 업체(Vercel)의 로그 보관 정책에 따른 기간 동안 보관됩니다.</li>
          <li>
            전자적 파일은 복구할 수 없는 방법으로 삭제합니다. 관계 법령에 따라 보존해야 하는 정보가
            있으면 해당 기간 동안 분리 보관합니다.
          </li>
        </ul>
      </Section>

      <Section title="4. 처리 위탁 및 국외 이전">
        <p>
          서비스 제공을 위해 아래 업체에 개인정보 처리를 위탁하며, 이 중 일부는 국외에서 처리됩니다.
          개인정보는 서비스 이용 시점에 네트워크를 통해 암호화된 상태로 전송됩니다. 국외 이전을
          원하지 않으면 서비스 이용을 중단하고 계정을 삭제할 수 있으나, 이 경우 서비스를 이용할 수
          없습니다.
        </p>
        <Table
          head={['수탁자 (국가)', '이전 항목', '목적', '보유 기간']}
          rows={[
            [
              'OpenAI, L.L.C. (미국)',
              '입력 텍스트·이미지·PDF, 분석에 필요한 캘린더 일정 일부(제목·시간·장소)',
              'AI 일정 분석',
              'OpenAI API 정책에 따라 오남용 감시 목적으로 최대 30일 보관 후 삭제. 모델 학습에 사용되지 않음',
            ],
            ['Supabase, Inc. (' + region + ')', '1항의 저장 항목 전부', '데이터베이스 운영', '회원 탈퇴 시까지'],
            ['Vercel Inc. (미국)', '서비스 요청 전체, 접속 기록', '서비스 호스팅', 'Vercel 로그 보관 기간'],
            [
              'Google LLC (미국)',
              '로그인·캘린더·결제 관련 정보',
              'Google 로그인, Google Calendar 연동, Google Play 결제',
              '이용자의 Google 계정 정책에 따름',
            ],
            [
              '웹 푸시 서비스 (Google, Mozilla, Apple 등, 미국)',
              '알림 내용(종단 간 암호화)',
              '결과 알림 전달',
              '전달 후 삭제',
            ],
          ]}
        />
      </Section>

      <Section title="5. 제3자 제공">
        <p>
          운영자는 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만 법령에 따라 수사기관 등이
          적법한 절차로 요구하는 경우는 예외로 합니다.
        </p>
      </Section>

      <Section title="6. Google 사용자 데이터">
        <p>
          서비스는 Google Calendar 데이터를 이용자가 요청한 일정 등록·수정 기능을 제공하는 데에만
          사용합니다. Google 사용자 데이터를 광고에 사용하거나 판매하지 않으며, 범용 AI 모델의 학습에
          사용하지 않습니다. 운영자는 보안 대응, 법령 준수, 또는 이용자의 명시적 동의가 있는 경우를
          제외하고 Google 사용자 데이터를 열람하지 않습니다.
        </p>
        <p lang="en">
          CalDrop&apos;s use and transfer to any other app of information received from Google APIs
          will adhere to the{' '}
          <a
            className="underline underline-offset-2"
            href="https://developers.google.com/terms/api-services-user-data-policy"
          >
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements.
        </p>
      </Section>

      <Section title="7. 이용자의 권리">
        <p>
          이용자는 언제든지 자신의 개인정보 열람, 정정, 삭제, 처리 정지를 요구할 수 있습니다. 계정
          삭제는{' '}
          <Link className="underline underline-offset-2" href="/account">
            계정 페이지
          </Link>
          에서 바로 할 수 있고, 그 밖의 요청은 아래 연락처로 보내 주시면 지체 없이 처리합니다. Google
          계정 설정(myaccount.google.com/permissions)에서 CalDrop의 접근 권한을 직접 철회할 수도
          있습니다.
        </p>
      </Section>

      <Section title="8. 쿠키 등 자동 수집 장치">
        <p>
          로그인 유지를 위한 세션 쿠키(HttpOnly) 하나만 사용합니다. 광고나 행태 분석용 쿠키, 외부 분석
          도구는 사용하지 않습니다. 브라우저 설정에서 쿠키를 거부할 수 있으나, 이 경우 로그인이
          필요한 기능을 이용할 수 없습니다.
        </p>
      </Section>

      <Section title="9. 안전성 확보 조치">
        <ul className="list-disc space-y-1.5 pl-5">
          <li>모든 통신은 HTTPS로 암호화합니다.</li>
          <li>Google 리프레시 토큰은 AES-256-GCM으로 암호화해 저장하며, 브라우저로 보내지 않습니다.</li>
          <li>데이터베이스는 서버만 접근할 수 있도록 접근 통제(RLS)를 적용합니다.</li>
          <li>업로드한 파일은 저장하지 않으며, 음성은 서버로 받지 않습니다.</li>
        </ul>
      </Section>

      <Section title="10. 만 14세 미만 아동">
        <p>서비스는 만 14세 미만 아동을 대상으로 하지 않으며, 아동의 개인정보를 알고 수집하지 않습니다.</p>
      </Section>

      <Section title="11. 개인정보 보호책임자">
        <p>
          개인정보 보호책임자: {operator}
          <br />
          연락처: {email}
        </p>
        <p>
          개인정보 침해에 대한 신고나 상담은 개인정보침해신고센터(privacy.kisa.or.kr, 국번 없이 118),
          개인정보분쟁조정위원회(kopico.go.kr, 1833-6972)에 문의할 수 있습니다.
        </p>
      </Section>

      <Section title="12. 처리방침의 변경">
        <p>
          이 방침이 바뀌면 시행 7일 전부터 서비스 화면을 통해 알립니다. 이용자 권리에 중요한 변경은
          30일 전에 알립니다.
        </p>
      </Section>
    </main>
  );
}
