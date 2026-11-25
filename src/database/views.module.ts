import { Module } from '@nestjs/common';
import { DatabaseViewsService } from './views.service';

@Module({ providers: [DatabaseViewsService] })
export class DatabaseViewsModule {}
