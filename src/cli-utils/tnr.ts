// src/cli-utils/tnr.ts
if (import.meta.main) {
  const action = process.argv[2];
  const { execFileSync } = await import("child_process");
  const { parseTestOutput, compareSnapshots } = await import("../memory/tnr");
  const { TNRCheckpointSchema } = await import("../memory/tnr-types");

  const BUN = process.env.HOME + "/.bun/bin/bun";

  if (action === "checkpoint") {
    const hash = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).trim();
    const testOutput = (() => {
      try {
        return execFileSync(BUN, ["test"], { encoding: "utf-8", timeout: 300000 });
      } catch (e: any) {
        return e.stdout ?? "";
      }
    })();
    const snapshot = parseTestOutput(testOutput);
    const checkpoint = {
      hash,
      timestamp: new Date().toISOString(),
      test_snapshot: snapshot,
    };
    console.log(JSON.stringify(checkpoint));

  } else if (action === "validate") {
    const checkpointRaw = process.argv[3];
    if (!checkpointRaw) {
      console.error(JSON.stringify({ error: "Usage: tnr.ts validate <checkpoint_json>" }));
      process.exit(1);
    }
    const checkpoint = TNRCheckpointSchema.parse(JSON.parse(checkpointRaw));
    const testOutput = (() => {
      try {
        return execFileSync(BUN, ["test"], { encoding: "utf-8", timeout: 300000 });
      } catch (e: any) {
        return e.stdout ?? "";
      }
    })();
    const postAttempt = parseTestOutput(testOutput);
    const comparison = compareSnapshots(checkpoint.test_snapshot, postAttempt);
    const result = {
      checkpoint,
      post_attempt: postAttempt,
      ...comparison,
    };
    console.log(JSON.stringify(result));

  } else if (action === "revert") {
    const hash = process.argv[3];
    if (!hash) {
      console.error(JSON.stringify({ error: "Usage: tnr.ts revert <commit_hash>" }));
      process.exit(1);
    }
    // Validate hash is a valid git ref (alphanumeric only)
    if (!/^[a-f0-9]+$/i.test(hash)) {
      console.error(JSON.stringify({ error: "Invalid commit hash" }));
      process.exit(1);
    }
    execFileSync("git", ["reset", "--hard", hash], { encoding: "utf-8" });
    console.log(JSON.stringify({ success: true, reverted_to: hash }));

  } else {
    console.error(JSON.stringify({ error: "Usage: tnr.ts <checkpoint|validate|revert> ..." }));
    process.exit(1);
  }
}
