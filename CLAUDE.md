# Cocos API

- Money is `Decimal`, never a JS number, and travels as decimal strings in JSON.
- Seed columns are lowercase, so Prisma needs `@map`.
- No comments unless truly needed to explain a why the code cannot show. No references to tasks or decisions.
