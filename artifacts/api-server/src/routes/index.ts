import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import propertiesRouter from "./properties";
import conversationsRouter from "./conversations";
import quotesRouter from "./quotes";
import demoRouter from "./demo";
import costEngineRouter from "./costEngineRoutes";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(propertiesRouter);
router.use(conversationsRouter);
router.use(quotesRouter);
router.use(demoRouter);
router.use(costEngineRouter);

export default router;
