// Canonical URL contract (Sprint 4). The db-backed slug→entity resolvers the
// /companies/* routes call through live here; the PURE path builders
// (companyPath / wedgePath / …) live in @fromtheloop/shared so client code +
// lib/routes can import them without pulling in the db dependency.
export * from "./resolve.js";
