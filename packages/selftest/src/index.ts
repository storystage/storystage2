/**
 * @storystage/selftest: Built-in self-test.
 *
 * Owner: S1. Workplan: WP18.1.
 *
 * `runSelfTest(STEPS, context)` runs the self-test; `reportText` turns the result into plain
 * words. The studio's menu item (S5), CI, and each app build (WP18b) all run the same steps.
 */
export * from './runner.ts';
export { reportText } from './report.ts';
export { STEPS, type SelfTestContext } from './steps.ts';
