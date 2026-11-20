import {
  BadRequestException, Controller, Get, NotFoundException, Param, Post, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { STORE_ROLES } from './store.entities';

const DIR = join(process.cwd(), 'uploads', 'store');
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const NAME = /^[a-f0-9-]{36}\.(jpg|png|webp)$/;

interface UploadedImage { buffer: Buffer; mimetype: string; size: number }

/** Product photos: the shop owner uploads them, everybody can see them. */
@ApiTags('store-uploads')
@Controller('store')
export class StoreUploadController {
  @Post('owner/upload')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(STORE_ROLES.OWNER)
  @ApiOperation({ summary: 'Upload a product photo (jpg, png or webp, up to 3 MB)' })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 3 * 1024 * 1024 } }))
  upload(@UploadedFile() file: UploadedImage | undefined) {
    if (!file) throw new BadRequestException('Choose a photo to upload');
    const ext = TYPES[file.mimetype];
    if (!ext) throw new BadRequestException('Only jpg, png or webp photos are allowed');
    mkdirSync(DIR, { recursive: true });
    const name = `${randomUUID()}.${ext}`;
    writeFileSync(join(DIR, name), file.buffer);
    // a path the app puts after the server address
    return { url: `/api/store/uploads/${name}` };
  }

  @Get('uploads/:name')
  @ApiOperation({ summary: 'A product photo' })
  photo(@Param('name') name: string, @Res() res: { sendFile: (path: string) => void }) {
    if (!NAME.test(name) || !existsSync(join(DIR, name))) throw new NotFoundException('Photo not found');
    res.sendFile(join(DIR, name));
  }
}
