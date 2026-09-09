-- CreateTable
CREATE TABLE `projects` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `prompt` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'CREATED',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `datasets` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `original_filename` VARCHAR(191) NOT NULL,
    `storage_key` VARCHAR(191) NOT NULL,
    `file_size` INTEGER NOT NULL,
    `rows` INTEGER NULL,
    `columns` INTEGER NULL,
    `target_column` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `datasets_project_id_idx`(`project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `training_runs` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `dataset_id` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'QUEUED',
    `task_type` VARCHAR(191) NULL,
    `domain` VARCHAR(191) NULL,
    `target_column` VARCHAR(191) NULL,
    `algorithm` VARCHAR(191) NULL,
    `metrics` JSON NULL,
    `hyperparameters` JSON NULL,
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `error_code` VARCHAR(191) NULL,
    `error_message` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `training_runs_project_id_idx`(`project_id`),
    INDEX `training_runs_dataset_id_idx`(`dataset_id`),
    INDEX `training_runs_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `model_artifacts` (
    `id` VARCHAR(191) NOT NULL,
    `training_run_id` VARCHAR(191) NOT NULL,
    `model_storage_key` VARCHAR(191) NULL,
    `report_storage_key` VARCHAR(191) NULL,
    `script_storage_key` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `model_artifacts_training_run_id_key`(`training_run_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `datasets` ADD CONSTRAINT `datasets_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `training_runs` ADD CONSTRAINT `training_runs_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `training_runs` ADD CONSTRAINT `training_runs_dataset_id_fkey` FOREIGN KEY (`dataset_id`) REFERENCES `datasets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `model_artifacts` ADD CONSTRAINT `model_artifacts_training_run_id_fkey` FOREIGN KEY (`training_run_id`) REFERENCES `training_runs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
