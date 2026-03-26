import { Router } from 'express';
import * as c from '../controllers/product.controllers';
import validate from '../middlewares/validate';
import { createProductValidator } from '../middlewares/product.validator';

const router = Router();

router.get('/', c.getAll);
router.get('/:id', c.getOne);
router.post('/', createProductValidator, validate, c.create);
router.put('/:id', c.update);
router.delete('/:id', c.remove);

export default router;