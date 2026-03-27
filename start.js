// Starts core (8402) + admin-api (8403) in the same process
// admin-ui is served separately via `pnpm dev` in admin-ui package

import "./packages/core/dist/index.js";
import "./packages/admin-api/dist/index.js";
