import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Profile, Strategy, VerifyCallback } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(configService: ConfigService) {
    const clientID = configService.get<string>('GOOGLE_CLIENT_ID') || 'disabled-google-client-id';
    const clientSecret =
      configService.get<string>('GOOGLE_CLIENT_SECRET') || 'disabled-google-client-secret';

    super({
      clientID,
      clientSecret,
      callbackURL:
        configService.get<string>('GOOGLE_CALLBACK_URL') ?? 'http://localhost:4000/auth/google/callback',
      scope: ['profile', 'email'],
    });
  }

  validate(accessToken: string, refreshToken: string, profile: Profile, done: VerifyCallback) {
    done(null, {
      provider: 'GOOGLE',
      providerId: profile.id,
      email: profile.emails?.[0]?.value,
      name: profile.displayName,
    });
  }
}
