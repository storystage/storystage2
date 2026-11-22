/**
 * The runtime worker's own file (WP6.1): it runs one scene at a time, with the Story API's
 * blocks, speaking `messages.ts` to the page. The page starts it with
 * `new Worker(new URL('@storystage/runtime/worker', import.meta.url), { type: 'module' })`.
 */
import { STORY_LIBRARY } from '@storystage/story-api';
import { messagePort, type FromRuntime, type MessageEnd, type ToRuntime } from './messages.ts';
import { serve } from './serve.ts';

serve(messagePort<FromRuntime, ToRuntime>(self as unknown as MessageEnd), STORY_LIBRARY);
