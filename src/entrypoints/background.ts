import { initializeBackgroundRuntime } from '../background/runtime';

export default defineBackground(() => {
  initializeBackgroundRuntime();
});
