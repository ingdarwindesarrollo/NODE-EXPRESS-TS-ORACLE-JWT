import { Request, Response, NextFunction } from 'express';
import * as service from '../services/product.service';

export const getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        res.json(await service.getAll());
    } catch (error) {
        next(error);
    }
};

export const getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const data = await service.getById(Number(req.params.id));
        if (!data) {
            const error = new Error('Producto no encontrado') as Error & { status: number };
            error.status = 404;
            next(error);
            return;
        }
        res.json(data);
    } catch (error) {
        next(error);
    }
};

export const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try { await service.create(req.body); res.status(201).json({ message: 'Producto creado' }); } 
    catch (error) { next(error); }
}

export const update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try { await service.update(Number(req.params.id), req.body); 
        res.json({ message: 'Producto actualizado' }); }
        catch (error) { next(error); }
}

export const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try { await service.remove(Number(req.params.id));
        res.json({ message: 'Producto eliminado' }); }
        catch (error) { next(error); }
}