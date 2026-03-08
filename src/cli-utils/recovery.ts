import { handleFailure } from "../executor/recovery";

async function main() {
  const taskRaw = process.argv[2];
  const approach = process.argv[3];
  const testOutput = process.argv[4];
  const maxRetriesRaw = process.argv[5];

  if (!taskRaw || !approach || !testOutput) {
    console.error(
      JSON.stringify({
        error: "Usage: recovery.ts <task_json> <approach> <test_output> [max_retries]",
      })
    );
    process.exit(1);
  }

  const task = JSON.parse(taskRaw);
  const maxRetries = maxRetriesRaw ? parseInt(maxRetriesRaw, 10) : 3;

  const result = handleFailure(task, approach, testOutput, maxRetries);
  console.log(JSON.stringify(result));
}

main().catch((err) => {
  console.error(JSON.stringify({ error: String(err) }));
  process.exit(1);
});
