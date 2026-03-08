// src/cli-utils/difficulty.ts

if (import.meta.main) {
  const action = process.argv[2];

  if (action === "estimate") {
    const contextRaw = process.argv[3];
    if (!contextRaw) {
      console.error(JSON.stringify({ error: "Usage: difficulty.ts estimate '<context_json>'" }));
      process.exit(1);
    }
    const { estimateDifficulty } = await import("../routing/difficulty");
    const ctx = JSON.parse(contextRaw);

    // Validate required fields
    if (!ctx.description || ctx.affected_file_count === undefined || !ctx.verification_type) {
      console.error(JSON.stringify({
        error: "context_json must include: description, affected_file_count, verification_type, historical_failure_rate, technical_term_count"
      }));
      process.exit(1);
    }

    // Apply defaults for optional fields
    const fullCtx = {
      description: ctx.description,
      affected_file_count: ctx.affected_file_count ?? 1,
      verification_type: ctx.verification_type ?? "test",
      historical_failure_rate: ctx.historical_failure_rate ?? 0,
      technical_term_count: ctx.technical_term_count ?? 0,
    };

    const difficulty = estimateDifficulty(fullCtx);
    console.log(JSON.stringify({
      difficulty,
      factors: {
        description_words: fullCtx.description.split(/\s+/).length,
        affected_files: fullCtx.affected_file_count,
        verification_type: fullCtx.verification_type,
        historical_failure_rate: fullCtx.historical_failure_rate,
        technical_term_count: fullCtx.technical_term_count,
      }
    }));

  } else {
    console.error(JSON.stringify({ error: "Usage: difficulty.ts estimate '<context_json>'" }));
    process.exit(1);
  }
}
