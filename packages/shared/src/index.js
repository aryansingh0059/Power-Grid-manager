"use strict";
/**
 * Core domain types shared between backend and frontend.
 *
 * Conventions:
 * - TelemetryMessage uses snake_case to match the IoT device wire format exactly.
 * - All internal domain types use camelCase (TypeScript convention).
 * - No runtime code — types and enums only.
 * - No external dependencies.
 */
Object.defineProperty(exports, "__esModule", { value: true });
