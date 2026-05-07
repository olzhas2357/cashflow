package handlers

import (
	"errors"
	"fmt"

	"cashflow/models"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

// sellAssetToMarket выполняет продажу актива внешнему покупателю по правилам настольного Cashflow (строго).
//
// Шаги по спецификации:
//
//	profit = marketPrice - asset.Mortgage
//	player.Cash += profit
//	player.LiabilitiesTotal -= asset.Mortgage
//	player.PassiveIncome -= asset.Income (cashflow с актива)
//
// снимается долг по банковскому займу на покупку этого актива (LoanAmount / LoanExpense), актив удаляется,
// затем reconcile по оставшимся активам и пересчёт месячных полей.
//
// Вызов только внутри db.Transaction; seller должен быть загружен с Profession; asset — строка таблицы assets.
func (h *AuditorPanelHandler) sellAssetToMarket(tx *gorm.DB, gameID uuid.UUID, seller *models.Player, asset *models.Asset, marketPrice int64) error {
	if asset == nil || seller == nil {
		return errors.New("invalid_sale_arguments")
	}
	if asset.OwnerID == nil || *asset.OwnerID != seller.ID {
		return errors.New("asset_not_owned")
	}
	if asset.GameID == nil || *asset.GameID != gameID {
		return errors.New("asset_wrong_game")
	}

	profit := marketPrice - asset.Mortgage

	seller.Cash += profit
	seller.PassiveIncome -= asset.Income
	seller.LiabilitiesTotal -= asset.Mortgage

	seller.LoanBalance -= asset.LoanAmount
	seller.LoanExpense -= asset.LoanExpense
	if seller.LoanBalance < 0 {
		seller.LoanBalance = 0
	}
	if seller.LoanExpense < 0 {
		seller.LoanExpense = 0
	}
	if seller.LiabilitiesTotal < 0 {
		seller.LiabilitiesTotal = professionBaseLiabilities(seller.Profession)
	}

	if err := tx.Delete(asset).Error; err != nil {
		return fmt.Errorf("delete_asset: %w", err)
	}

	if err := h.reconcilePlayerFromAssets(tx, seller); err != nil {
		return err
	}

	h.recalculatePlayerFinancials(seller, seller.Profession)

	return tx.Save(seller).Error
}
