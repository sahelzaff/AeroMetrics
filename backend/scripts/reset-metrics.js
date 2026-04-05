/* eslint-disable no-console */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const shouldRun = args.includes('--yes');
const includeBlueprints = args.includes('--include-blueprints');

function printUsage() {
  console.log('Reset metrics/attempt data script');
  console.log('');
  console.log('Usage:');
  console.log('  npm run reset:metrics -- --yes');
  console.log('  npm run reset:metrics -- --yes --include-blueprints');
  console.log('');
  console.log('What it clears:');
  console.log('  - AttemptAnswer');
  console.log('  - AttemptQuestion');
  console.log('  - TestAttempt');
  console.log('  - ChapterMetricSnapshot');
  console.log('');
  console.log('Optional with --include-blueprints:');
  console.log('  - BlueprintRule');
  console.log('  - TestBlueprint');
}

async function main() {
  if (!shouldRun) {
    printUsage();
    console.log('');
    console.log('No changes made. Pass --yes to execute.');
    process.exit(0);
  }

  console.log('Reset started...');

  const metricsResult = await prisma.$transaction([
    prisma.attemptAnswer.deleteMany(),
    prisma.attemptQuestion.deleteMany(),
    prisma.testAttempt.deleteMany(),
    prisma.chapterMetricSnapshot.deleteMany(),
  ]);

  const summary = {
    attemptAnswerDeleted: metricsResult[0].count,
    attemptQuestionDeleted: metricsResult[1].count,
    testAttemptDeleted: metricsResult[2].count,
    chapterMetricSnapshotDeleted: metricsResult[3].count,
    blueprintRuleDeleted: 0,
    testBlueprintDeleted: 0,
  };

  if (includeBlueprints) {
    const blueprintResult = await prisma.$transaction([
      prisma.blueprintRule.deleteMany(),
      prisma.testBlueprint.deleteMany(),
    ]);
    summary.blueprintRuleDeleted = blueprintResult[0].count;
    summary.testBlueprintDeleted = blueprintResult[1].count;
  }

  console.log('Reset completed. Summary:');
  console.table(summary);
}

main()
  .catch((error) => {
    console.error('Reset failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
