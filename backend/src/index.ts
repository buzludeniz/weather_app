import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { createApp } from "./app.js";
import { createAlertScheduler } from "./jobs/scheduler.js";

const app = createApp();

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "Nimbus Weather API listening");

  if (env.ALERT_SCANNER_ENABLED) {
    createAlertScheduler().start();
  } else {
    logger.info("Alert scanner disabled for this process");
  }
});
