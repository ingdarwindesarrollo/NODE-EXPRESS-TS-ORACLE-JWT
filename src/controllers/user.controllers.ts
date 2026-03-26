import { Request, Response, NextFunction } from 'express';
import * as service from '../services/user.service';

export const getAll = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        res.json(await service.getAll());
    } catch (error) {
        next(error);
    }
}

export const getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        const data = await service.getById(Number(req.params.id));
        if (!data){
            const error = new Error('Usuario no existe') as Error & { status?: number };
            error.status = 404;
            next(error);
            return;
        }
    } catch (error) {
        next(error);
    }
}

export const create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        await service.create(req.body);
        res.status(201).json({  message: 'Usuario creado' });
    } catch (error) {
        next(error);
    }
}


export const update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        await service.update(Number(req.params.id), req.body);
        res.json({ message: 'Actualizado' });
    } catch (err) { next(err); }
};

export const remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
        await service.remove(Number(req.params.id));
        res.json({ message: 'Eliminado' });
    } catch (err) { next(err); }
};
