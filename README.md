# CORNERED

등 뒤는 로프다. 브라우저에서 바로 하는 1인칭 3D 복싱.

**플레이: https://dinored960018.github.io/cornered/**

## 조작

메뉴에서 두 가지 중 하나를 고릅니다.

| 동작 | A (WASD + HJKL) | B (방향키 + QWER) |
| --- | --- | --- |
| 앞으로 / 뒤로 | `W` / `Shift` | `↑` / `Shift` |
| 좌우 위빙 | `A` `D` | `←` `→` |
| 숙이기 | `S` | `↓` |
| 왼손 / 오른손 | `H` `J` | `Q` `W` |
| 왼훅 / 오른훅 | `K` `L` | `E` `R` |
| 어퍼 | `S` 누른 채 `H`/`J` | `↓` 누른 채 `Q`/`W` |
| 가드 | `Space` | `Space` |
| 몸통 | `Space` 누른 채 `H`/`J` | `F` |
| 필살기 | `E` | `D` |

Ctrl은 쓰지 않습니다 (Ctrl+W로 창이 닫히기 때문).

상대 주먹은 맞기 직전까지 내 머리를 따라옵니다. 일찍 움직이면 맞고, 끝까지 보고 움직여야 피합니다.

## 복서

인파이터, 아웃복서, 행운복서, 더티복서, 스위치복서, 사우스포, 탱크복서. 수치와 필살기는 `js/roster.js`에 있습니다.

## 개발

```
npm start         # http://localhost:7900
npm test          # 규칙 테스트
npm run balance   # 봇과 붙여 본 승률
node scripts/shots.mjs   # 장면 스크린샷
node scripts/play.mjs    # 실제 키 입력으로 한 판
```

빌드 없는 ES 모듈입니다. 3D는 `vendor/`의 Three.js를 쓰고, 모델과 소리는 전부 코드로 만듭니다.
