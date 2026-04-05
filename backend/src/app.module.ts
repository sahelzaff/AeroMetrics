import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ImportsModule } from './imports/imports.module';
import { TestsModule } from './tests/tests.module';
import { AttemptsModule } from './attempts/attempts.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { BlueprintsModule } from './blueprints/blueprints.module';
import { QuestionBankModule } from './question-bank/question-bank.module';
import { HealthController } from './health.controller';
import { ObservabilityModule } from './observability/observability.module';
import { SearchModule } from './search/search.module';

@Module({
  controllers: [HealthController],
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ObservabilityModule,
    PrismaModule,
    AuthModule,
    ImportsModule,
    TestsModule,
    BlueprintsModule,
    QuestionBankModule,
    AttemptsModule,
    AnalyticsModule,
    DashboardModule,
    SearchModule,
  ],
})
export class AppModule {}

