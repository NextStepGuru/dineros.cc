-- AlterTable
ALTER TABLE `reoccurrence_split` ADD COLUMN `amount_mode` ENUM('FIXED', 'PERCENT') NOT NULL DEFAULT 'FIXED';

-- AlterTable
ALTER TABLE `savings_goal` ADD COLUMN `category_id` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `savings_goal_category_id_idx` ON `savings_goal`(`category_id`);

-- AddForeignKey
ALTER TABLE `savings_goal` ADD CONSTRAINT `savings_goal_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
