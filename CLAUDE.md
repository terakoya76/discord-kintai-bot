# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Discord bot for attendance tracking (kintai) that integrates with Google Sheets. Users issue commands in Discord channels to track work sessions, breaks, and calculate working hours.

## Commands

```bash
# Install dependencies
pnpm install --frozen-lockfile

# Run tests
pnpm test

# Run single test file
pnpm vitest run src/spreadsheet.test.ts

# Run tests in watch mode
pnpm vitest

# Lint
pnpm lint

# Auto-fix lint issues
pnpm fix

# Compile TypeScript
pnpm compile

# Run coverage
pnpm coverage
```

## Architecture

```
main.ts                 Entry point - Discord message handler routing
src/
  discord.ts            Discord client, message validation, channel/thread utilities
  work.ts               Command handlers (!start, !suspend, !resume, !end)
  spreadsheet.ts        Google Sheets integration, state machine, time calculations
  healthcheck.ts        HTTP server for keep-alive
```

### Data Flow

1. `main.ts` receives Discord messages, validates via `discord.ts`, routes to `work.ts` handlers
2. `work.ts` extracts org/channel context, delegates to `spreadsheet.ts` for state operations
3. `spreadsheet.ts` manages SheetRow state machine and persists to Google Sheets

### State Machine

Work sessions follow: `IDLE -> WORKING <-> ON_BREAK -> ENDED`

- `!start` in channel: Creates thread, transitions to WORKING
- `!suspend` in thread: Transitions WORKING -> ON_BREAK
- `!resume` in thread: Transitions ON_BREAK -> WORKING
- `!end` in thread: Closes any open break, transitions to ENDED

### Key Types (spreadsheet.ts)

```typescript
type WorkState = 'working' | 'break' | 'completed';
interface SheetRow {
  threadId: string;
  startTime?: Date;
  endTime?: Date;
  breakTimeRecords: BreakTimeRecord[];
  breakTime: number;      // Total break time in minutes
  workingTime: number;    // Working time in minutes
  state: WorkState;
}
```

## Environment Variables

| Variable | Required | Default |
|----------|----------|---------|
| `DISCORD_BOT_TOKEN` | Yes | - |
| `GOOGLE_SERVICE_ACCOUNT_CREDENTIALS_PATH` | No | `/etc/discord-kintai-bot/google_service_account_credentials.json` |
| `ORG_TO_SHEET_ID_CONF_PATH` | No | `/etc/discord-kintai-bot/org_to_sheet_id.json` |

## Testing

Tests use vitest with mocked Google APIs. Test file naming: `*.test.ts` in `src/`.

The spreadsheet state transformation functions are pure and testable:
- `startWorkRow()`, `suspendWorkRow()`, `resumeWorkRow()`, `endWorkRow()` - immutable state transitions
- `deriveState()` - derives WorkState from row data

Use `vi.useFakeTimers()` for time-dependent tests.

## Channel Naming Convention

Bot responds only in channels named `<org-name>-kintai` or `<org-name>`. The org name maps to a Google Sheet ID via `org_to_sheet_id.json`.
