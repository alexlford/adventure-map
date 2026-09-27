# Phase 4 — Polish

Phase 4 hardens the existing Adventures experience without changing the archive model or adding another framework.

## Publication-wide polish

- Every public route and generated record page receives the shared `polish.css` stylesheet through the static-shell build.
- Reduced-motion preferences disable smooth scrolling and collapse animation/transition durations.
- Phone/coarse-pointer controls receive a 44 px minimum touch target.
- Mobile media and core layout containers are constrained against horizontal overflow.

## Validation

- `validate:polish` verifies the shared stylesheet contract across every public document.
- Critical HTML/CSS/JS assets have generous regression budgets so accidental payload growth fails CI before deployment.
- Browser coverage verifies reduced motion, mobile navigation/filter touch targets, and phone-width overflow on Home, Map, and a representative record page.
