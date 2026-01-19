import { Router } from "express";

// Imports dos Controllers (Verifique se os caminhos batem com seus arquivos)
import { configPaymentController } from "./controllers/admin/configPaymentController";
import { loginController } from "./controllers/auth/loginController";
import { createTenantController } from "./controllers/auth/createTenantController";
import { registerController } from "./controllers/auth/registerController"; // <--- Adicionado
import { checkoutController } from "./controllers/checkoutController";      // <--- O que estava faltando
import { requestRecharge } from "./controllers/rechargeController";
import { mercadoPagoWebhookController } from "./controllers/webhooks/mercadoPagoWebhookController";
import { monnifyWebhookController } from "./controllers/webhooks/monnifyWebhookController";
import { ensureAuthenticated } from "./middlewares/ensureAuthenticated";
import { resolveTenant } from "./middlewares/tenantResolver";

export const routes = Router();

// --- Rotas Públicas (Webhooks) ---
routes.post("/webhooks/monnify", monnifyWebhookController);
routes.post("/webhooks/mercadopago", mercadoPagoWebhookController);
routes.post("/:tenantSlug/checkout", resolveTenant, checkoutController);
routes.post("/:tenantSlug/auth/register", resolveTenant, registerController); // <--- Ajustado para receber o slug
routes.post("/auth/login", loginController);
routes.post("/auth/register", createTenantController);
routes.post("/admin/config-payment", ensureAuthenticated, configPaymentController);
routes.post("/reseller/recharge", ensureAuthenticated, requestRecharge);
