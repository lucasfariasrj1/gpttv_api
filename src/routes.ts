import { Router } from "express";

import { configPaymentController } from "./controllers/admin/configPaymentController";
import { loginController } from "./controllers/auth/loginController";
import { registerController } from "./controllers/auth/registerController";
import { checkoutController } from "./controllers/checkoutController";
import { requestRecharge } from "./controllers/rechargeController";
import { mercadoPagoWebhookController } from "./controllers/webhooks/mercadoPagoWebhookController";
import { monnifyWebhookController } from "./controllers/webhooks/monnifyWebhookController";
import { ensureAuthenticated } from "./middlewares/ensureAuthenticated";
import { resolveTenant } from "./middlewares/tenantResolver";

export const routes = Router();

routes.post("/webhooks/monnify", monnifyWebhookController);
routes.post("/webhooks/mercadopago", mercadoPagoWebhookController);

routes.post("/:tenantSlug/checkout", resolveTenant, checkoutController);

routes.post("/auth/login", loginController);
routes.post("/auth/register", registerController);
routes.post("/admin/config-payment", ensureAuthenticated, configPaymentController);
routes.post("/reseller/recharge", ensureAuthenticated, requestRecharge);
