import { Request, Response, NextFunction } from "express";
import logger from "../utils/logger";

interface AppError extends Error {
    status?: number;
}

function errorHandler(err: AppError, req: Request, res: Response,  _next:NextFunction): void {
    let message = err.message;
    let status = err.status ?? 500;

       if (err.message.includes('ORA-00001')) {
            message = 'Registro duplicado';
            status = 400;
        }
        if (err.message.includes('ORA-00942')) {
            message = 'Tabla no existe';
            status = 500;
        }
        if (err.message.includes('ORA-02291')) {
            message = 'Violacion de clave foranea';
            status = 400;
        }
    logger.error(`Error: ${err.message}, Status: ${status}`);
    res.status(status).json({ success: false, message });
}
export default errorHandler;