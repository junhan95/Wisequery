import cron from 'node-cron';
import { storage } from './storage';
import { sendExpirationWarningEmail } from './email';

// Default retention policies by plan (in days)
export const DEFAULT_RETENTION_POLICIES: Record<string, {
  conversationRetentionDays: number;
  fileRetentionDays: number;
  sessionRetentionDays: number;
  archiveGracePeriodDays: number;
}> = {
  free: {
    conversationRetentionDays: 30,
    fileRetentionDays: 60,
    sessionRetentionDays: 7,
    archiveGracePeriodDays: 30,
  },
  basic: {
    conversationRetentionDays: 180,
    fileRetentionDays: 180,
    sessionRetentionDays: 30,
    archiveGracePeriodDays: 30,
  },
  pro: {
    conversationRetentionDays: 365,
    fileRetentionDays: 365,
    sessionRetentionDays: 90,
    archiveGracePeriodDays: 60,
  },
  enterprise: {
    conversationRetentionDays: -1, // Unlimited
    fileRetentionDays: -1,
    sessionRetentionDays: 365,
    archiveGracePeriodDays: 90,
  },
};

// Warning period before archiving (in days)
const WARNING_DAYS_BEFORE_ARCHIVE = 7;

interface ExpirationCandidate {
  id: string;
  userId: string;
  name: string;
  type: 'conversation' | 'file' | 'project';
  createdAt: Date;
  lastActivityAt?: Date | null;
  userEmail?: string;
  userPlan?: string;
}

export class ExpirationScheduler {
  private isRunning = false;

  async getRetentionPolicy(plan: string) {
    const customPolicy = await storage.getRetentionPolicy(plan);
    if (customPolicy) {
      return customPolicy;
    }
    return DEFAULT_RETENTION_POLICIES[plan] || DEFAULT_RETENTION_POLICIES.free;
  }

  async processWarnings() {
    console.log('[Scheduler] Processing expiration warnings...');
    
    try {
      const usersWithItems = await storage.getUsersWithExpiringItems(WARNING_DAYS_BEFORE_ARCHIVE);
      
      for (const user of usersWithItems) {
        const policy = await this.getRetentionPolicy(user.plan || 'free');
        
        if (policy.conversationRetentionDays === -1) {
          continue; // Unlimited retention
        }

        const warningDate = new Date();
        warningDate.setDate(warningDate.getDate() + WARNING_DAYS_BEFORE_ARCHIVE);
        
        const expiringConversations = await storage.getExpiringConversations(
          user.id,
          policy.conversationRetentionDays,
          WARNING_DAYS_BEFORE_ARCHIVE
        );

        const expiringFiles = await storage.getExpiringFiles(
          user.id,
          policy.fileRetentionDays,
          WARNING_DAYS_BEFORE_ARCHIVE
        );

        if (expiringConversations.length > 0 || expiringFiles.length > 0) {
          // Create pending notification
          await storage.createPendingNotification({
            userId: user.id,
            type: 'expiration_warning',
            entityType: 'mixed',
            entityId: 'multiple',
            entityName: `${expiringConversations.length} conversations, ${expiringFiles.length} files`,
            scheduledFor: new Date(),
          });

          // Send email if user has email
          if (user.email) {
            try {
              await sendExpirationWarningEmail(
                user.email,
                expiringConversations.length,
                expiringFiles.length,
                WARNING_DAYS_BEFORE_ARCHIVE
              );
              console.log(`[Scheduler] Sent warning email to ${user.email}`);
            } catch (error) {
              console.error(`[Scheduler] Failed to send warning email to ${user.email}:`, error);
            }
          }
        }
      }
    } catch (error) {
      console.error('[Scheduler] Error processing warnings:', error);
    }
  }

  async processArchiving() {
    console.log('[Scheduler] Processing archiving...');
    
    try {
      const users = await storage.getAllUsersWithSubscriptions();
      
      for (const user of users) {
        const policy = await this.getRetentionPolicy(user.plan || 'free');
        
        // Skip unlimited retention plans
        if (policy.conversationRetentionDays === -1) {
          continue;
        }

        // Archive expired conversations
        const archivedConversations = await storage.archiveExpiredConversations(
          user.id,
          policy.conversationRetentionDays
        );

        if (archivedConversations > 0) {
          await storage.createAuditEvent({
            userId: user.id,
            action: 'auto_archive',
            entityType: 'conversations',
            entityId: 'batch',
            entityName: `${archivedConversations} conversations`,
            details: { count: archivedConversations, reason: 'retention_policy' },
          });
          console.log(`[Scheduler] Archived ${archivedConversations} conversations for user ${user.id}`);
        }

        // Archive expired files
        const archivedFiles = await storage.archiveExpiredFiles(
          user.id,
          policy.fileRetentionDays
        );

        if (archivedFiles > 0) {
          await storage.createAuditEvent({
            userId: user.id,
            action: 'auto_archive',
            entityType: 'files',
            entityId: 'batch',
            entityName: `${archivedFiles} files`,
            details: { count: archivedFiles, reason: 'retention_policy' },
          });
          console.log(`[Scheduler] Archived ${archivedFiles} files for user ${user.id}`);
        }
      }
    } catch (error) {
      console.error('[Scheduler] Error processing archiving:', error);
    }
  }

  async processPermanentDeletion() {
    console.log('[Scheduler] Processing permanent deletion...');
    
    try {
      const users = await storage.getAllUsersWithSubscriptions();
      
      for (const user of users) {
        const policy = await this.getRetentionPolicy(user.plan || 'free');
        
        // Skip unlimited retention plans
        if (policy.conversationRetentionDays === -1) {
          continue;
        }

        // Permanently delete conversations archived beyond grace period
        const deletedConversations = await storage.deleteArchivedConversations(
          user.id,
          policy.archiveGracePeriodDays
        );

        if (deletedConversations > 0) {
          await storage.createAuditEvent({
            userId: user.id,
            action: 'auto_delete',
            entityType: 'conversations',
            entityId: 'batch',
            entityName: `${deletedConversations} conversations`,
            details: { count: deletedConversations, reason: 'grace_period_expired' },
          });
          console.log(`[Scheduler] Deleted ${deletedConversations} conversations for user ${user.id}`);
        }

        // Permanently delete files archived beyond grace period
        const deletedFiles = await storage.deleteArchivedFiles(
          user.id,
          policy.archiveGracePeriodDays
        );

        if (deletedFiles > 0) {
          await storage.createAuditEvent({
            userId: user.id,
            action: 'auto_delete',
            entityType: 'files',
            entityId: 'batch',
            entityName: `${deletedFiles} files`,
            details: { count: deletedFiles, reason: 'grace_period_expired' },
          });
          console.log(`[Scheduler] Deleted ${deletedFiles} files for user ${user.id}`);
        }
      }
    } catch (error) {
      console.error('[Scheduler] Error processing permanent deletion:', error);
    }
  }

  async cleanupExpiredSessions() {
    console.log('[Scheduler] Cleaning up expired sessions...');
    
    try {
      const deletedSessions = await storage.deleteExpiredSessions();
      if (deletedSessions > 0) {
        console.log(`[Scheduler] Deleted ${deletedSessions} expired sessions`);
      }
    } catch (error) {
      console.error('[Scheduler] Error cleaning up sessions:', error);
    }
  }

  async runDailyMaintenance() {
    if (this.isRunning) {
      console.log('[Scheduler] Maintenance already running, skipping...');
      return;
    }

    this.isRunning = true;
    console.log('[Scheduler] Starting daily maintenance...');

    try {
      // Step 1: Send warnings for items about to expire
      await this.processWarnings();
      
      // Step 2: Archive expired items
      await this.processArchiving();
      
      // Step 3: Permanently delete items beyond grace period
      await this.processPermanentDeletion();
      
      // Step 4: Clean up expired sessions
      await this.cleanupExpiredSessions();

      console.log('[Scheduler] Daily maintenance completed');
    } catch (error) {
      console.error('[Scheduler] Error during daily maintenance:', error);
    } finally {
      this.isRunning = false;
    }
  }

  start() {
    // Run daily at 3 AM UTC
    cron.schedule('0 3 * * *', () => {
      this.runDailyMaintenance();
    });

    // Also run hourly session cleanup
    cron.schedule('0 * * * *', () => {
      this.cleanupExpiredSessions();
    });

    console.log('[Scheduler] Expiration scheduler started');
  }
}

export const expirationScheduler = new ExpirationScheduler();
