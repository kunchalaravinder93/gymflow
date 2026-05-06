import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import dashboardRouter from "./dashboard";
import membersRouter from "./members";
import plansRouter from "./plans";
import subscriptionsRouter from "./subscriptions";
import paymentsRouter from "./payments";
import notificationsRouter from "./notifications";
import checkinsRouter from "./checkins";
import staffRouter from "./staff";
import superadminRouter from "./superadmin";
import workoutProgramsRouter from "./workout-programs";
import workoutsRouter from "./workouts";
import memberPortalRouter from "./member-portal";
import cronRouter from "./cron";

const router: IRouter = Router();

router.use(cronRouter);
router.use(healthRouter);
router.use(authRouter);
router.use(dashboardRouter);
router.use(membersRouter);
router.use(plansRouter);
router.use(subscriptionsRouter);
router.use(paymentsRouter);
router.use(notificationsRouter);
router.use(checkinsRouter);
router.use(staffRouter);
router.use(superadminRouter);
router.use(workoutProgramsRouter);
router.use(workoutsRouter);
router.use(memberPortalRouter);

export default router;

