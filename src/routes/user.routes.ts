import { Router } from 'express';
import * as c from '../controllers/user.controllers';
import validate from '../middlewares/validate';
import { createUserValidator } from '../middlewares/user.validator';

const router = Router();

router.get('/',    c.getAll);
router.get('/:id', c.getOne);

router.post(
    '/',
    createUserValidator,
    validate,
    c.create
);

router.put('/:id',    c.update);
router.delete('/:id', c.remove);

export default router;
