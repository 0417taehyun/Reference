# 추천사 PR 안내 / Contributing References

## 추천사 작성 (한국어)

PR에는 한 언어의 원문만 작성해도 됩니다. `main` 병합 후 OpenAI가 누락된 언어를 번역하고, 검증을 통과한 파일을 `main`에 직접 커밋합니다. 원문과 이미 존재하는 번역본은 자동으로 덮어쓰지 않습니다. 원문을 수정한 경우 기존 번역본도 함께 검토해 주세요.

1. 이 저장소를 Fork하고 `reference/your-name` 같은 작업 브랜치를 만듭니다.
2. `references/ko/<refId>.md` 또는 `references/en/<refId>.md`를 만듭니다. 파일명과 `refId`는 동일한 영문 소문자·숫자·하이픈을 사용합니다. 예: `03-your-name.md`.
3. 사진의 `photo`에는 외부 HTTPS 이미지 URL 또는 `/photos/your-name.jpg` 같은 로컬 이미지 경로를 적습니다. 로컬 파일은 `public/` 아래에 두며 폴더명은 자유입니다. 예를 들어 `public/images/your-name.jpg`는 `/images/your-name.jpg`로 적습니다. 직접 작성한 내용 또는 공개 동의를 받은 내용만 올려 주세요.
4. 본문은 문단 중심의 Markdown으로 작성합니다. 원시 HTML은 허용하지 않습니다. 긴 문단의 줄 길이는 제한하지 않습니다.
5. 로컬에서 다음 검사를 실행합니다.

   ```sh
   npm ci
   npm run lint:references
   npm run check
   ```

6. 추천사와 사진 파일을 커밋하고 Fork의 작업 브랜치에 push합니다. GitHub에서 **Compare & pull request**를 선택하고, 대상 저장소 `0417taehyun/Reference`의 `main` 브랜치로 PR을 엽니다.
7. PR 템플릿에 작성자·원문 언어·파일 경로를 적고 확인 목록을 작성합니다. 이름과 직함의 선호 번역이 있으면 **Translation notes / 번역 참고**에 적어 주세요.

```markdown
---
refId: 03-your-name
order: 3
name: "홍길동"
title: "Engineering Manager"
company: "Example Company"
relationship: "직속 매니저"
period: "2023 – 2025"
photo: "/photos/your-name.jpg"
linkedin: "https://www.linkedin.com/in/your-name"
translated: false
keywords:
  - ownership
annotations:
  - text: "끝까지 해결하는"
    type: circle
  - text: "끝까지 해결하는"
    type: star
---

그는 ==문제를 끝까지 해결하는== 동료입니다.
```

`linkedin`, `keywords`, `annotations`는 생략할 수 있습니다. LinkedIn은 HTTPS 주소를 사용합니다. `name`, `title`, `company`, `relationship`, `period`, `photo`, `order`, `refId`는 필수입니다.

키워드는 YAML의 `keywords` 아래에 문자열 목록으로 적습니다. 예를 들어 `keywords: [성장, 설계]`는 앞쪽 요약에 두 키워드와 언급 인원수를 표시합니다. 키워드는 본문 문구와 정확히 일치할 필요가 없으며, 같은 추천사의 중복 키워드는 한 명으로 집계합니다. 두 언어에서 키워드 값과 순서를 동일하게 유지하세요. 언어별 표시 이름은 `src/i18n/ui.ts`의 `keywordLabels`에서 관리합니다.

밑줄은 본문에 `==강조할 문구==`만 적습니다. `{설계}` 같은 태그는 붙이지 않습니다. 밑줄 안에는 굵게·기울임·링크를 넣지 마세요. 동그라미와 별표의 `annotations.text`는 본문의 실제 문구와 정확히 같아야 합니다. 같은 구절을 강조하려면 두 항목에 같은 문구를 적습니다. 별표는 동그라미 왼쪽 위에 그려집니다.

두 언어를 직접 작성한다면 파일명·`refId`·`order`·`period`·`photo`·`linkedin`을 동일하게 유지합니다. 회사·조직명은 승인된 번역 규칙을 사용하며, `당근마켓`은 영어에서 `Karrot`으로 표기합니다. 그 외 등록되지 않은 회사명은 원문을 유지합니다. 키워드 목록·순서, 밑줄 개수·순서, Annotation 개수·순서·종류, 문단·Markdown 구조와 링크 대상도 같아야 합니다. 강조 문구와 Annotation 문구는 각 언어에 맞게 함께 번역합니다. 번역본은 `translated: true`, `originalLanguage: ko` 또는 `en`으로 원문의 언어를 표시합니다.

## Writing a reference (English)

You may submit only the original language in your PR. After merge, OpenAI translates a missing counterpart, validates it, and commits it directly to `main`. Automation never overwrites the original or an existing translation. When revising an original, review its existing translation too.

1. Fork this repository and create a working branch such as `reference/your-name`.
2. Create `references/en/<refId>.md` or `references/ko/<refId>.md`. The filename and `refId` must match and use lowercase ASCII letters, digits, and hyphens, for example `03-your-name.md`.
3. Set `photo` to an external HTTPS image URL or a local path such as `/photos/your-name.jpg`. Local images can be anywhere under `public/`; for example, `public/images/your-name.jpg` uses `/images/your-name.jpg`. Submit your own reference or obtain permission to publish it.
4. Write paragraph-based Markdown. Raw HTML is prohibited; prose line length is unrestricted.
5. Run the local checks:

   ```sh
   npm ci
   npm run lint:references
   npm run check
   ```

6. Commit the reference and photo, then push your working branch to your fork. Select **Compare & pull request** on GitHub and target the `main` branch of `0417taehyun/Reference`.
7. Complete the PR template with your name, source language, file path, and checklist. Add preferred name or job-title translations under **Translation notes / 번역 참고**.

```markdown
---
refId: 03-your-name
order: 3
name: "Your Name"
title: "Engineering Manager"
company: "Example Company"
relationship: "Direct manager"
period: "2023 – 2025"
photo: "/photos/your-name.jpg"
linkedin: "https://www.linkedin.com/in/your-name"
translated: false
keywords:
  - ownership
annotations:
  - text: "through resolution"
    type: circle
  - text: "through resolution"
    type: star
---

They ==take ownership through resolution==.
```

`linkedin`, `keywords`, and `annotations` are optional. Use an HTTPS LinkedIn URL. All other fields in the example are required except `translated`, which defaults to `false`.

Write keywords as a YAML `keywords` list, for example `keywords: [성장, 설계]`. The summary shows each keyword and the number of people who mentioned it. A keyword need not appear verbatim in the body; duplicates within one reference count as one person. Preserve keyword values and order across languages. Localized display names live in `keywordLabels` in `src/i18n/ui.ts`.

Use only `==highlighted text==` for underlines; do not append tags such as `{설계}`. Keep highlight contents plain text, without nested emphasis or links. Annotation `text` must exactly match a phrase in the body. Circle and star entries for the same phrase must use identical text; the star appears above-left of the circle.

For a manually supplied pair, keep filename, `refId`, `order`, `period`, `photo`, and `linkedin` identical. Company names follow the approved glossary: `당근마켓` becomes `Karrot` in English; unlisted company names remain unchanged. Preserve keyword values/order, highlight count/order, annotation count/order/types, paragraph/Markdown structure, and link destinations. Translate highlighted phrases and annotation targets together. Mark the translation with `translated: true` and `originalLanguage: ko` or `en` to identify its original language.
