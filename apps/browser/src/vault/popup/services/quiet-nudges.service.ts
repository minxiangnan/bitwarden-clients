import { Injectable } from "@angular/core";
import { Observable, of } from "rxjs";

import { NudgesService } from "@bitwarden/angular/vault";
import { UserId } from "@bitwarden/common/types/guid";

/** This build does not show onboarding nudges, badges, or spotlights. */
@Injectable()
export class QuietNudgesService extends NudgesService {
  override showNudgeSpotlight$(): Observable<boolean> {
    return of(false);
  }

  override showNudgeBadge$(): Observable<boolean> {
    return of(false);
  }

  override hasActiveBadges$(_userId: UserId): Observable<boolean> {
    return of(false);
  }
}
