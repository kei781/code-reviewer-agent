import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import type {
  ReviewClaimResult,
  ReviewFailureRecord,
  ReviewPublishedRecord,
  ReviewStateKey,
  ReviewStateRecord,
  ReviewStateStorePort
} from "../../app/runEnsembleReview.js";
import type {
  FollowUpClaimResult,
  FollowUpFailureRecord,
  FollowUpRespondedRecord,
  FollowUpStateRecord,
  FollowUpStateStorePort
} from "../../app/respondToReviewerMention.js";

export interface SqliteReviewStateStoreOptions {
  readonly databasePath: string;
}

export interface SqliteReviewStateStore extends ReviewStateStorePort, FollowUpStateStorePort {
  close(): void;
}

interface SqliteReviewStateStoreStatements {
  readonly selectReviewDelivery: StatementSync;
  readonly selectReviewState: StatementSync;
  readonly insertReviewClaim: StatementSync;
  readonly selectReviewFingerprints: StatementSync;
  readonly insertReviewPublication: StatementSync;
  readonly insertReviewFingerprint: StatementSync;
  readonly insertReviewFailure: StatementSync;
  readonly selectFollowUpDelivery: StatementSync;
  readonly selectFollowUpState: StatementSync;
  readonly insertFollowUpClaim: StatementSync;
  readonly insertFollowUpResponse: StatementSync;
  readonly insertFollowUpFailure: StatementSync;
}

export function createSqliteReviewStateStore(options: SqliteReviewStateStoreOptions): SqliteReviewStateStore {
  mkdirSync(path.dirname(options.databasePath), { recursive: true });

  const database = new DatabaseSync(options.databasePath);
  database.exec(schemaSql);

  const statements: SqliteReviewStateStoreStatements = {
    selectReviewDelivery: database.prepare("SELECT delivery_id FROM review_claims WHERE delivery_id = ?"),
    selectReviewState: database.prepare(
      "SELECT delivery_id FROM review_claims WHERE repository_full_name = ? AND pull_request_number = ? AND head_sha = ?"
    ),
    insertReviewClaim: database.prepare(
      `INSERT INTO review_claims (
        delivery_id, repository_full_name, pull_request_number, head_sha, created_at
      ) VALUES (?, ?, ?, ?, ?)`
    ),
    selectReviewFingerprints: database.prepare(
      `SELECT fingerprint FROM review_finding_fingerprints
       WHERE repository_full_name = ? AND pull_request_number = ? AND head_sha = ?
       ORDER BY id`
    ),
    insertReviewPublication: database.prepare(
      `INSERT OR IGNORE INTO review_publications (
        delivery_id, repository_full_name, pull_request_number, head_sha, created_at
      ) VALUES (?, ?, ?, ?, ?)`
    ),
    insertReviewFingerprint: database.prepare(
      `INSERT OR IGNORE INTO review_finding_fingerprints (
        repository_full_name, pull_request_number, head_sha, fingerprint, created_at
      ) VALUES (?, ?, ?, ?, ?)`
    ),
    insertReviewFailure: database.prepare(
      `INSERT INTO review_failures (
        delivery_id, repository_full_name, pull_request_number, head_sha, stage, message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ),
    selectFollowUpDelivery: database.prepare("SELECT delivery_id FROM follow_up_claims WHERE delivery_id = ?"),
    selectFollowUpState: database.prepare(
      `SELECT delivery_id FROM follow_up_claims
       WHERE repository_full_name = ?
         AND pull_request_number = ?
         AND head_sha = ?
         AND comment_id = ?
         AND comment_revision_key = ?`
    ),
    insertFollowUpClaim: database.prepare(
      `INSERT INTO follow_up_claims (
        delivery_id,
        repository_full_name,
        pull_request_number,
        head_sha,
        comment_id,
        comment_revision_key,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`
    ),
    insertFollowUpResponse: database.prepare(
      `INSERT OR REPLACE INTO follow_up_responses (
        repository_full_name,
        pull_request_number,
        head_sha,
        comment_id,
        comment_revision_key,
        delivery_id,
        response_scope,
        reviewed_sha,
        merge_signal,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ),
    insertFollowUpFailure: database.prepare(
      `INSERT INTO follow_up_failures (
        delivery_id,
        repository_full_name,
        pull_request_number,
        head_sha,
        comment_id,
        comment_revision_key,
        stage,
        message,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
  };

  return {
    async claimReview(input) {
      return withTransaction(database, () => claimReview(input, statements));
    },
    async listPostedFindingFingerprints(input) {
      return statements.selectReviewFingerprints
        .all(input.repositoryFullName, input.pullRequestNumber, input.headSha)
        .map(readFingerprint);
    },
    async markReviewPublished(input) {
      withTransaction(database, () => {
        const createdAt = now();
        statements.insertReviewPublication.run(
          input.deliveryId,
          input.repositoryFullName,
          input.pullRequestNumber,
          input.headSha,
          createdAt
        );

        for (const fingerprint of input.postedFindingFingerprints) {
          statements.insertReviewFingerprint.run(
            input.repositoryFullName,
            input.pullRequestNumber,
            input.headSha,
            fingerprint,
            createdAt
          );
        }
      });
    },
    async markReviewFailed(input) {
      markReviewFailed(input, statements);
    },
    async claimFollowUp(input) {
      return withTransaction(database, () => claimFollowUp(input, statements));
    },
    async markFollowUpResponded(input) {
      statements.insertFollowUpResponse.run(
        input.repositoryFullName,
        input.pullRequestNumber,
        input.headSha,
        input.commentId,
        input.commentRevisionKey,
        input.deliveryId,
        input.responseScope,
        input.reviewedSha,
        input.mergeSignal ?? null,
        now()
      );
    },
    async markFollowUpFailed(input) {
      statements.insertFollowUpFailure.run(
        input.deliveryId,
        input.repositoryFullName,
        input.pullRequestNumber,
        input.headSha,
        input.commentId,
        input.commentRevisionKey,
        input.stage,
        input.message,
        now()
      );
    },
    close() {
      database.close();
    }
  };
}

function claimReview(
  input: ReviewStateRecord,
  statements: SqliteReviewStateStoreStatements
): ReviewClaimResult {
  if (hasRow(statements.selectReviewDelivery.get(input.deliveryId))) {
    return { status: "already-processed-delivery" };
  }

  if (
    hasRow(
      statements.selectReviewState.get(input.repositoryFullName, input.pullRequestNumber, input.headSha)
    )
  ) {
    return { status: "already-reviewed-sha" };
  }

  statements.insertReviewClaim.run(
    input.deliveryId,
    input.repositoryFullName,
    input.pullRequestNumber,
    input.headSha,
    now()
  );

  return { status: "claimed" };
}

function markReviewFailed(
  input: ReviewFailureRecord,
  statements: SqliteReviewStateStoreStatements
): void {
  statements.insertReviewFailure.run(
    input.deliveryId,
    input.repositoryFullName,
    input.pullRequestNumber,
    input.headSha,
    input.stage,
    input.message,
    now()
  );
}

function claimFollowUp(
  input: FollowUpStateRecord,
  statements: SqliteReviewStateStoreStatements
): FollowUpClaimResult {
  if (hasRow(statements.selectFollowUpDelivery.get(input.deliveryId))) {
    return { status: "already-processed-delivery" };
  }

  if (
    hasRow(
      statements.selectFollowUpState.get(
        input.repositoryFullName,
        input.pullRequestNumber,
        input.headSha,
        input.commentId,
        input.commentRevisionKey
      )
    )
  ) {
    return { status: "already-processed-comment" };
  }

  statements.insertFollowUpClaim.run(
    input.deliveryId,
    input.repositoryFullName,
    input.pullRequestNumber,
    input.headSha,
    input.commentId,
    input.commentRevisionKey,
    now()
  );

  return { status: "claimed" };
}

function withTransaction<T>(database: DatabaseSync, operation: () => T): T {
  database.exec("BEGIN IMMEDIATE");

  try {
    const result = operation();
    database.exec("COMMIT");
    return result;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function hasRow(row: Record<string, unknown> | undefined): boolean {
  return row !== undefined;
}

function readFingerprint(row: Record<string, unknown>): string {
  const fingerprint = row["fingerprint"];

  if (typeof fingerprint !== "string") {
    throw new Error("Invalid fingerprint row");
  }

  return fingerprint;
}

function now(): string {
  return new Date().toISOString();
}

const schemaSql = `
CREATE TABLE IF NOT EXISTS review_claims (
  delivery_id TEXT PRIMARY KEY,
  repository_full_name TEXT NOT NULL,
  pull_request_number INTEGER NOT NULL,
  head_sha TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS review_claims_state_idx
ON review_claims (repository_full_name, pull_request_number, head_sha);

CREATE TABLE IF NOT EXISTS review_publications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id TEXT NOT NULL,
  repository_full_name TEXT NOT NULL,
  pull_request_number INTEGER NOT NULL,
  head_sha TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (repository_full_name, pull_request_number, head_sha)
);

CREATE TABLE IF NOT EXISTS review_finding_fingerprints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  repository_full_name TEXT NOT NULL,
  pull_request_number INTEGER NOT NULL,
  head_sha TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (repository_full_name, pull_request_number, head_sha, fingerprint)
);

CREATE TABLE IF NOT EXISTS review_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id TEXT NOT NULL,
  repository_full_name TEXT NOT NULL,
  pull_request_number INTEGER NOT NULL,
  head_sha TEXT NOT NULL,
  stage TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS follow_up_claims (
  delivery_id TEXT PRIMARY KEY,
  repository_full_name TEXT NOT NULL,
  pull_request_number INTEGER NOT NULL,
  head_sha TEXT NOT NULL,
  comment_id INTEGER NOT NULL,
  comment_revision_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (repository_full_name, pull_request_number, head_sha, comment_id, comment_revision_key)
);

CREATE TABLE IF NOT EXISTS follow_up_responses (
  repository_full_name TEXT NOT NULL,
  pull_request_number INTEGER NOT NULL,
  head_sha TEXT NOT NULL,
  comment_id INTEGER NOT NULL,
  comment_revision_key TEXT NOT NULL,
  delivery_id TEXT NOT NULL,
  response_scope TEXT NOT NULL,
  reviewed_sha TEXT NOT NULL,
  merge_signal TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY (repository_full_name, pull_request_number, head_sha, comment_id, comment_revision_key)
);

CREATE TABLE IF NOT EXISTS follow_up_failures (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  delivery_id TEXT NOT NULL,
  repository_full_name TEXT NOT NULL,
  pull_request_number INTEGER NOT NULL,
  head_sha TEXT NOT NULL,
  comment_id INTEGER NOT NULL,
  comment_revision_key TEXT NOT NULL,
  stage TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;
