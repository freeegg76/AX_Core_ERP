import { Module } from '@nestjs/common';
import { PartnerQuery } from './infrastructure/partner.query';
import { PartnerRepository } from './infrastructure/partner.repository';
import {
  ClientController,
  TermController,
  VendorController,
} from './presentation/partner.controller';

/** PARTNER 도메인 (15 엔드포인트) — terms 5 · clients 5 · vendors 5 */
@Module({
  controllers: [TermController, ClientController, VendorController],
  providers: [PartnerRepository, PartnerQuery],
  exports: [PartnerQuery, PartnerRepository],
})
export class PartnerModule {}
