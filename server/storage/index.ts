import { BaseStorage } from "./base";
import { UsersMixin } from "./users.storage";
import { ProjectsMixin } from "./projects.storage";
import { FoldersMixin } from "./folders.storage";
import { ConversationsMixin } from "./conversations.storage";
import { MessagesMixin } from "./messages.storage";
import { FilesMixin } from "./files.storage";
import { SubscriptionsMixin, FileChunksMixin } from "./subscriptions.storage";
import { AdminMixin } from "./admin.storage";
import { TrashMixin } from "./trash.storage";
import { GoogleDriveMixin } from "./googledrive.storage";
import { VectorSearchMixin } from "./vector.storage";

// Re-export IStorage interface
export type { IStorage } from "./types";

/**
 * TypeScript mixin 합성 유틸리티.
 * 여러 mixin 클래스의 메서드를 대상 클래스의 프로토타입으로 복사합니다.
 */
function applyMixins(derivedCtor: any, constructors: any[]) {
    constructors.forEach((baseCtor) => {
        Object.getOwnPropertyNames(baseCtor.prototype).forEach((name) => {
            if (name !== "constructor") {
                Object.defineProperty(
                    derivedCtor.prototype,
                    name,
                    Object.getOwnPropertyDescriptor(baseCtor.prototype, name) ||
                    Object.create(null)
                );
            }
        });
    });
}

/**
 * 리팩토링된 DatabaseStorage.
 * 모든 도메인별 mixin의 메서드를 하나의 클래스로 합성합니다.
 */
export class DatabaseStorage extends BaseStorage {
    constructor() {
        super();
    }
}

// 각 mixin의 인터페이스를 DatabaseStorage에 병합
export interface DatabaseStorage
    extends UsersMixin,
    ProjectsMixin,
    FoldersMixin,
    ConversationsMixin,
    MessagesMixin,
    FilesMixin,
    SubscriptionsMixin,
    FileChunksMixin,
    AdminMixin,
    TrashMixin,
    GoogleDriveMixin,
    VectorSearchMixin { }

// mixin 메서드를 DatabaseStorage 프로토타입에 적용
applyMixins(DatabaseStorage, [
    UsersMixin,
    ProjectsMixin,
    FoldersMixin,
    ConversationsMixin,
    MessagesMixin,
    FilesMixin,
    SubscriptionsMixin,
    FileChunksMixin,
    AdminMixin,
    TrashMixin,
    GoogleDriveMixin,
    VectorSearchMixin,
]);

// 싱글톤 스토리지 인스턴스
export const storage = new DatabaseStorage();
