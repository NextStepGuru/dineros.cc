-- CreateTable
CREATE TABLE `openai_request_log` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `purpose` VARCHAR(191) NOT NULL,
    `model` VARCHAR(191) NOT NULL,
    `prompt_tokens` INTEGER NULL,
    `completion_tokens` INTEGER NULL,
    `total_tokens` INTEGER NULL,
    `cached_prompt_tokens` INTEGER NULL,
    `openai_response_id` VARCHAR(191) NULL,
    `finish_reason` VARCHAR(64) NULL,
    `duration_ms` INTEGER NOT NULL,
    `success` BOOLEAN NOT NULL,
    `error_message` TEXT NULL,
    `http_status` INTEGER NULL,
    `metadata` JSON NULL,

    INDEX `openai_request_log_created_at_idx`(`created_at`),
    INDEX `openai_request_log_purpose_idx`(`purpose`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
