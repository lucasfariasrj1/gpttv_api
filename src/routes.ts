import { Router } from "express";

// Imports dos Controllers (Verifique se os caminhos batem com seus arquivos)
import { configPaymentController } from "./controllers/admin/configPaymentController";
import { loginController } from "./controllers/auth/loginController";
import { registerController } from "./controllers/auth/registerController"; // <--- Adicionado
import { checkoutController } from "./controllers/checkoutController";      // <--- O que estava faltando
import { requestRecharge } from "./controllers/rechargeController";
import { mercadoPagoWebhookController } from "./controllers/webhooks/mercadoPagoWebhookController";
import { monnifyWebhookController } from "./controllers/webhooks/monnifyWebhookController";

// Imports dos Middlewares
import { ensureAuthenticated } from "./middlewares/ensureAuthenticated";
import { resolveTenant } from "./middlewares/tenantResolver";

export const routes = Router();

// --- Rotas Públicas (Webhooks) ---
routes.post("/webhooks/monnify", monnifyWebhookController);
routes.post("/webhooks/mercadopago", mercadoPagoWebhookController);

// --- Rotas Multi-Tenant (Públicas, mas dependem da Loja) ---
// O :tenantSlug é obrigatório para sabermos em qual loja operar
routes.post("/:tenantSlug/checkout", resolveTenant, checkoutController);
routes.post("/:tenantSlug/auth/register", resolveTenant, registerController); // <--- Ajustado para receber o slug

// --- Rotas de Autenticação Global ---
routes.post("/auth/login", loginController);

// --- Rotas Protegidas (Requerem Token Logado) ---
routes.post("/admin/config-payment", ensureAuthenticated, configPaymentController);
routes.post("/reseller/recharge", ensureAuthenticated, requestRecharge);