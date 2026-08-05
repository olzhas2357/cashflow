package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/datatypes"
)

const (
	RolePlayer  = "player"
	RoleAuditor = "auditor"
	RoleAdmin   = "admin"
)

type User struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Email        string    `gorm:"type:varchar(255);uniqueIndex;not null" json:"email"`
	PasswordHash string    `gorm:"type:text;not null" json:"-"`
	Role         string    `gorm:"type:varchar(20);not null;index" json:"role"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

const (
	RoomStatusWaiting    = "WAITING"
	RoomStatusInProgress = "IN_PROGRESS"
	RoomStatusFinished   = "FINISHED"
)

// Room is the Stage-1 test-only room/lobby system (design/Task-Testing.md).
// Deliberately separate from GameSession/Player (the turn-engine tables) —
// see [[project_cashflow_architecture_mismatch]]-style note in room_auth
// service files for why.
type Room struct {
	ID uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`

	Code       string         `gorm:"type:varchar(10);not null;uniqueIndex" json:"code"`
	HostUserID uuid.UUID      `gorm:"type:uuid;not null;index" json:"host_user_id"`
	Status     string         `gorm:"type:varchar(20);not null;default:'WAITING'" json:"status"`
	Settings   datatypes.JSON `gorm:"type:jsonb;not null;default:'{}'" json:"settings"`

	CreatedAt time.Time `json:"created_at"`
	ExpiresAt time.Time `json:"expires_at"`
}

// RoomPlayer is a seat in a Room — a registered host or a name-only guest
// (UserID nil), identified for reconnect purposes by PlayerToken.
type RoomPlayer struct {
	ID uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`

	RoomID uuid.UUID  `gorm:"type:uuid;not null;index" json:"room_id"`
	UserID *uuid.UUID `gorm:"type:uuid;index" json:"user_id,omitempty"`
	Name   string     `gorm:"type:varchar(255);not null" json:"name"`
	// PlayerToken is only ever returned to this player themselves (join/create
	// response) — never included in the room roster shown to other players.
	PlayerToken uuid.UUID `gorm:"type:uuid;not null;uniqueIndex" json:"-"`
	Seat        int       `gorm:"not null" json:"seat"`
	IsHost      bool      `gorm:"not null;default:false" json:"is_host"`

	CreatedAt time.Time `json:"created_at"`
}

type Player struct {
	ID uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`

	UserID uuid.UUID `gorm:"type:uuid;uniqueIndex;not null;index" json:"user_id"`

	GameID *uuid.UUID `gorm:"type:uuid;index" json:"game_id,omitempty"`
	Name   string     `gorm:"type:varchar(255);not null;default:''" json:"name"`

	ProfessionID *uuid.UUID  `gorm:"type:uuid;index" json:"profession_id,omitempty"`
	Profession   *Profession `gorm:"foreignKey:ProfessionID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL" json:"profession,omitempty"`

	Cash             int64 `gorm:"not null;default:0" json:"cash"`
	Salary           int64 `gorm:"not null;default:0" json:"salary"`
	PassiveIncome    int64 `gorm:"not null;default:0" json:"passive_income"`
	Expenses         int64 `gorm:"not null;default:0" json:"expenses"`
	TotalIncome      int64 `gorm:"not null;default:0" json:"total_income"`
	TotalExpenses    int64 `gorm:"not null;default:0" json:"total_expenses"`
	MonthlyCashflow  int64 `gorm:"not null;default:0" json:"monthly_cashflow"`
	AssetsTotal      int64 `gorm:"not null;default:0" json:"assets_total"`
	LiabilitiesTotal int64 `gorm:"not null;default:0" json:"liabilities_total"`
	LoanBalance      int64 `gorm:"not null;default:0" json:"loan_balance"`
	LoanExpense      int64 `gorm:"not null;default:0" json:"loan_expense"`
	FinanciallyFree  bool  `gorm:"not null;default:false" json:"financially_free"`

	// Placement: 0 while still playing; 1/2/3 once financially free (finish order).
	Placement int `gorm:"not null;default:0" json:"placement"`
	// FinishedTurn: game.TurnNumber at the moment Placement was assigned.
	FinishedTurn int `gorm:"not null;default:0" json:"finished_turn"`

	ChildrenCount int `gorm:"not null;default:0" json:"children_count"`
	CharityTurns  int `gorm:"not null;default:0" json:"charity_turns"`
	SkipTurns     int `gorm:"not null;default:0" json:"skip_turns"`
	Position      int `gorm:"not null;default:0" json:"position"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Asset struct {
	ID uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`

	Name string `gorm:"type:varchar(255);not null" json:"name"`
	Type string `gorm:"type:varchar(30);not null;index" json:"type"` // stocks, real_estate, business, other
	// BuildingUnits: from deal JSON (e.g. 12 / 24) for Market matching; 0 if unknown.
	BuildingUnits int64 `gorm:"not null;default:0" json:"building_units"`
	// DealExternalID: seed id of the deal card that created this asset (big/small), for debugging / future rules.
	DealExternalID string `gorm:"type:varchar(128);not null;default:'';index" json:"deal_external_id,omitempty"`
	// Extra: deal metadata (beds, baths, units, …) for Market matching — mirrors board card JSON.
	Extra datatypes.JSON `gorm:"type:jsonb;not null;default:'{}'" json:"extra"`

	Price  int64 `gorm:"not null" json:"price"`
	Income int64 `gorm:"not null;default:0" json:"income"` // treat as monthly cashflow from this asset

	GameID      *uuid.UUID `gorm:"type:uuid;index" json:"game_id,omitempty"`
	DownPayment int64      `gorm:"not null;default:0" json:"down_payment"`
	Mortgage    int64      `gorm:"not null;default:0" json:"mortgage"`
	Symbol      string     `gorm:"type:varchar(64);not null;default:'';index" json:"symbol"`
	Shares      int64      `gorm:"not null;default:0" json:"shares"`
	UnitPrice   int64      `gorm:"not null;default:0" json:"unit_price"`
	LoanAmount  int64      `gorm:"not null;default:0" json:"loan_amount"`
	LoanExpense int64      `gorm:"not null;default:0" json:"loan_expense"`
	TurnsLeft   int        `gorm:"not null;default:0" json:"turns_left"`
	Payout      int64      `gorm:"not null;default:0" json:"payout"`

	OwnerID *uuid.UUID `gorm:"type:uuid;index" json:"owner_id"`
	Owner   *Player    `gorm:"foreignKey:OwnerID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL" json:"owner,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type MarketOffer struct {
	ID uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`

	GameID   *uuid.UUID `gorm:"type:uuid;index" json:"game_id,omitempty"`
	AssetID  uuid.UUID  `gorm:"type:uuid;not null;index" json:"asset_id"`
	SellerID uuid.UUID  `gorm:"type:uuid;not null;index" json:"seller_id"`

	Asset  Asset  `gorm:"foreignKey:AssetID;references:ID" json:"asset,omitempty"`
	Seller Player `gorm:"foreignKey:SellerID;references:ID" json:"seller,omitempty"`

	Price  int64  `gorm:"not null" json:"price"`
	Status string `gorm:"type:varchar(20);not null;index" json:"status"` // open, negotiation, closed

	// ExpiresAt: set when this offer is a timed player auction (2 minutes from
	// AuctionStart) — nil for a plain manual listing. See market_auction.go.
	ExpiresAt *time.Time `json:"expires_at,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Transaction struct {
	ID uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`

	GameID        *uuid.UUID `gorm:"type:uuid;index" json:"game_id,omitempty"`
	MarketOfferID uuid.UUID  `gorm:"type:uuid;not null;index" json:"market_offer_id"`
	BuyerID       uuid.UUID  `gorm:"type:uuid;not null;index" json:"buyer_id"`

	OfferPrice int64  `gorm:"not null" json:"offer_price"`
	Message    string `gorm:"type:text;not null;default:''" json:"message"`

	CounterOffer *int64 `gorm:"type:bigint" json:"counter_offer"`
	Status       string `gorm:"type:varchar(20);not null;index" json:"status"` // pending, approved, rejected
	AgreedPrice  *int64 `gorm:"type:bigint" json:"agreed_price"`

	MarketOffer MarketOffer `gorm:"foreignKey:MarketOfferID;references:ID" json:"market_offer,omitempty"`
	Buyer       Player      `gorm:"foreignKey:BuyerID;references:ID" json:"buyer,omitempty"`
	Seller      Player      `gorm:"-" json:"seller,omitempty"` // derived, unused — fully ignored by GORM (see market_auction.go's listOpenAuctionOffers, which does a plain Find on []Transaction; -:migration alone doesn't stop GORM's association auto-detection outside AutoMigrate)

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type AuditLog struct {
	ID uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`

	TransactionID uuid.UUID `gorm:"type:uuid;not null;uniqueIndex" json:"transaction_id"`
	AuditorID     uuid.UUID `gorm:"type:uuid;not null;index" json:"auditor_id"`

	Action string  `gorm:"type:varchar(20);not null;index" json:"action"` // approved, rejected
	Notes  *string `gorm:"type:text" json:"notes"`

	CreatedAt time.Time `json:"created_at"`
}

type GameSession struct {
	ID uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	// In cashflow terms, the board session for up to 6 players.
	Name              string     `gorm:"type:varchar(255);not null" json:"name"`
	MaxPlayers        int        `gorm:"not null" json:"max_players"`
	CreatedBy         uuid.UUID  `gorm:"type:uuid;not null;index" json:"created_by"`
	ActiveSmallDealID *uuid.UUID `gorm:"type:uuid;index" json:"active_small_deal_id,omitempty"`
	ActiveSmallDeal   *SmallDeal `gorm:"foreignKey:ActiveSmallDealID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL" json:"active_small_deal,omitempty"`
	// ActiveSmallDealOpenedBy: player who opened current small deal card (used by stock buy rules).
	ActiveSmallDealOpenedBy *uuid.UUID `gorm:"type:uuid;index" json:"active_small_deal_opened_by,omitempty"`

	ActiveMarketEventID *uuid.UUID   `gorm:"type:uuid;index" json:"active_market_event_id,omitempty"`
	ActiveMarketEvent   *MarketEvent `gorm:"foreignKey:ActiveMarketEventID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL" json:"active_market_event,omitempty"`
	// MarketRespondedPlayerIDs: player IDs (JSON array of strings) who have
	// already answered sell/skip for the currently-open ActiveMarketEvent —
	// the turn engine needs this to know when every eligible player has
	// responded, unlike the manual auditor-driven market flow.
	MarketRespondedPlayerIDs datatypes.JSON `gorm:"type:jsonb;not null;default:'[]'" json:"market_responded_player_ids"`

	// ActiveStockNewsDealID: the Stock News small-deal card whose split/
	// reverse-split effect was just auto-applied — every owner of the
	// affected symbol may choose to sell at the new price while this is set
	// (mirrors ActiveMarketEventID/MarketRespondedPlayerIDs above).
	ActiveStockNewsDealID       *uuid.UUID     `gorm:"type:uuid;index" json:"active_stock_news_deal_id,omitempty"`
	ActiveStockNewsDeal         *SmallDeal     `gorm:"foreignKey:ActiveStockNewsDealID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL" json:"active_stock_news_deal,omitempty"`
	StockNewsRespondedPlayerIDs datatypes.JSON `gorm:"type:jsonb;not null;default:'[]'" json:"stock_news_responded_player_ids"`

	// JoinCode lets players self-join the lobby without the auditor adding them manually.
	JoinCode string `gorm:"type:varchar(10);not null;uniqueIndex" json:"join_code"`
	// Status: lobby | in_progress | completed.
	Status string `gorm:"type:varchar(20);not null;default:'lobby'" json:"status"`

	CurrentTurnPlayerID *uuid.UUID `gorm:"type:uuid;index" json:"current_turn_player_id,omitempty"`
	CurrentTurnPlayer   *Player    `gorm:"foreignKey:CurrentTurnPlayerID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL" json:"current_turn_player,omitempty"`
	// TurnStatus: WAITING_ROLL | RESOLVING_CELL | AWAITING_DECISION | AWAITING_DEAL_CHOICE |
	// AWAITING_MARKET_DECISIONS | AWAITING_STOCK_NEWS_DECISIONS | AWAITING_CHARITY_DECISION |
	// AWAITING_DEAL_OFFER_CLAIM | TURN_COMPLETE.
	TurnStatus   string `gorm:"type:varchar(30);not null;default:'WAITING_ROLL'" json:"turn_status"`
	TurnNumber   int    `gorm:"not null;default:0" json:"turn_number"`
	LastDiceRoll *int   `json:"last_dice_roll,omitempty"`
	// WinnersCount: how many players have finished (Placement assigned) so far; game
	// completes once this reaches 3 or no active (Placement == 0) players remain.
	WinnersCount int `gorm:"not null;default:0" json:"winners_count"`

	ActiveBigDealID *uuid.UUID `gorm:"type:uuid;index" json:"active_big_deal_id,omitempty"`
	ActiveBigDeal   *BigDeal   `gorm:"foreignKey:ActiveBigDealID;references:ID;constraint:OnUpdate:CASCADE,OnDelete:SET NULL" json:"active_big_deal,omitempty"`

	// DealOfferedByPlayerID/DealOfferCommission/DealOfferClaimedBy: the active
	// Small/Big Deal's owner can broadcast it to all other active players with
	// a commission on top of the bank price; whoever accepts first (claims it)
	// buys the asset and pays the commission to the offering player.
	DealOfferedByPlayerID *uuid.UUID `gorm:"type:uuid;index" json:"deal_offered_by_player_id,omitempty"`
	DealOfferCommission   int64      `gorm:"not null;default:0" json:"deal_offer_commission"`
	DealOfferClaimedBy    *uuid.UUID `gorm:"type:uuid;index" json:"deal_offer_claimed_by,omitempty"`

	// DrawnSmallDealIDs/DrawnBigDealIDs/DrawnMarketEventIDs: JSON arrays of
	// card IDs already drawn this pass through the deck, so the same card
	// doesn't repeat until every card has been shown once. Reset (reshuffled)
	// automatically once the pool is exhausted — see services.DrawFromDeck.
	DrawnSmallDealIDs   datatypes.JSON `gorm:"type:jsonb;not null;default:'[]'" json:"drawn_small_deal_ids,omitempty"`
	DrawnBigDealIDs     datatypes.JSON `gorm:"type:jsonb;not null;default:'[]'" json:"drawn_big_deal_ids,omitempty"`
	DrawnMarketEventIDs datatypes.JSON `gorm:"type:jsonb;not null;default:'[]'" json:"drawn_market_event_ids,omitempty"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Profession struct {
	ID uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`

	Name string `gorm:"type:varchar(255);not null;uniqueIndex" json:"name"`

	Salary            int64 `gorm:"not null;default:0" json:"salary"`
	Tax               int64 `gorm:"not null;default:0" json:"tax"`
	MortgagePayment   int64 `gorm:"not null;default:0" json:"mortgage_payment"`
	SchoolLoanPayment int64 `gorm:"not null;default:0" json:"school_loan_payment"`
	CarLoanPayment    int64 `gorm:"not null;default:0" json:"car_loan_payment"`
	CreditCardPayment int64 `gorm:"not null;default:0" json:"credit_card_payment"`
	RetailPayment     int64 `gorm:"not null;default:0" json:"retail_payment"`
	OtherExpenses     int64 `gorm:"not null;default:0" json:"other_expenses"`
	ChildExpense      int64 `gorm:"not null;default:0" json:"child_expense"`
	Savings           int64 `gorm:"not null;default:0" json:"savings"`
	HomeMortgage      int64 `gorm:"not null;default:0" json:"home_mortgage"`
	SchoolLoans       int64 `gorm:"not null;default:0" json:"school_loans"`
	CarLoans          int64 `gorm:"not null;default:0" json:"car_loans"`
	CreditCards       int64 `gorm:"not null;default:0" json:"credit_cards"`
	RetailDebt        int64 `gorm:"not null;default:0" json:"retail_debt"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type SmallDeal struct {
	ID uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`

	ExternalID  string         `gorm:"type:varchar(128);not null;uniqueIndex" json:"external_id"`
	DealType    string         `gorm:"type:varchar(30);not null;index" json:"type"`
	Category    string         `gorm:"type:varchar(60);not null;default:'';index" json:"category"`
	Name        string         `gorm:"type:varchar(255);not null;index" json:"name"`
	Title       string         `gorm:"type:varchar(255);not null;default:''" json:"title"`
	Symbol      string         `gorm:"type:varchar(64);not null;default:'';index" json:"symbol"`
	Description string         `gorm:"type:text;not null;default:''" json:"description"`
	Price       int64          `gorm:"not null" json:"price"`
	DownPayment int64          `gorm:"not null;default:0" json:"down_payment"`
	Mortgage    int64          `gorm:"not null;default:0" json:"mortgage"`
	Cashflow    int64          `gorm:"not null;default:0" json:"cashflow"`
	ROI         float64        `gorm:"type:numeric(10,2);not null;default:0" json:"roi"`
	Extra       datatypes.JSON `gorm:"type:jsonb;not null;default:'{}'" json:"extra"`
}

type BigDeal struct {
	ID          uuid.UUID      `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	ExternalID  string         `gorm:"type:varchar(128);not null;default:'';index" json:"external_id,omitempty"`
	DealType    string         `gorm:"type:varchar(30);not null;default:'';index" json:"deal_type"`
	Name        string         `gorm:"type:varchar(255);not null;index" json:"name"`
	Title       string         `gorm:"type:varchar(255);not null;default:''" json:"title"`
	Description string         `gorm:"type:text;not null;default:''" json:"description"`
	Price       int64          `gorm:"not null" json:"price"`
	DownPayment int64          `gorm:"not null;default:0" json:"down_payment"`
	Mortgage    int64          `gorm:"not null;default:0" json:"mortgage"`
	Cashflow    int64          `gorm:"not null;default:0" json:"cashflow"`
	ROI         float64        `gorm:"type:numeric(10,2);not null;default:0" json:"roi"`
	Extra       datatypes.JSON `gorm:"type:jsonb;not null;default:'{}'" json:"extra"`
}

type MarketEvent struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Name        string    `gorm:"type:varchar(255);not null;index" json:"name"`
	EventType   string    `gorm:"type:varchar(60);not null;default:'';index" json:"event_type"`
	SubType     string    `gorm:"type:varchar(80);not null;default:'';index" json:"sub_type"`
	Description string    `gorm:"type:text;not null;default:''" json:"description"`
	OfferPrice  int64     `gorm:"not null;default:0" json:"offer_price"`
	IsGlobal    bool      `gorm:"not null;default:false" json:"is_global"`
	// Multiplier: BUSINESS_EXIT payout = asset.Price * Multiplier.
	Multiplier int64 `gorm:"not null;default:0" json:"multiplier"`
	// CashflowAdd: BUSINESS_BOOST — added to a matching business asset's Income.
	CashflowAdd int64 `gorm:"not null;default:0" json:"cashflow_add"`
	// ExtraValue: MARKET_BOOST — added on top of asset.Price to form the sell offer.
	ExtraValue int64 `gorm:"not null;default:0" json:"extra_value"`
	// IsForced: card resolves automatically with no player decision (e.g. BUSINESS_EXIT).
	IsForced bool `gorm:"not null;default:false" json:"is_forced"`
	// ImpactCashflowChange/ImpactDelayTurns: SPECIAL_LOAN's deferred-payout terms.
	ImpactCashflowChange int64 `gorm:"not null;default:0" json:"impact_cashflow_change"`
	ImpactDelayTurns     int   `gorm:"not null;default:0" json:"impact_delay_turns"`
}

type Doodad struct {
	ID                     uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	ExternalID             string    `gorm:"type:varchar(128);not null;uniqueIndex" json:"external_id"`
	DoodadType             string    `gorm:"type:varchar(40);not null;index" json:"doodad_type"`
	Name                   string    `gorm:"type:varchar(255);not null;index" json:"name"`
	Description            string    `gorm:"type:text;not null;default:''" json:"description"`
	Cost                   int64     `gorm:"not null;default:0" json:"cost"`
	CostPerChild           int64     `gorm:"not null;default:0" json:"cost_per_child"`
	LiabilityType          string    `gorm:"type:varchar(80);not null;default:''" json:"liability_type"`
	LiabilityAmount        int64     `gorm:"not null;default:0" json:"liability_amount"`
	MonthlyExpenseIncrease int64     `gorm:"not null;default:0" json:"monthly_expense_increase"`
}

type FinancialLog struct {
	ID       uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	GameID   uuid.UUID `gorm:"type:uuid;not null;index" json:"game_id"`
	PlayerID uuid.UUID `gorm:"type:uuid;not null;index" json:"player_id"`

	Amount             int64   `gorm:"not null;default:0" json:"amount"`
	Type               string  `gorm:"type:varchar(50);not null;index" json:"type"`
	ActionType         string  `gorm:"type:varchar(50);not null;default:'';index" json:"action_type"`
	DeltaSavings       int64   `gorm:"not null;default:0" json:"delta_savings"`
	DeltaPassiveIncome int64   `gorm:"not null;default:0" json:"delta_passive_income"`
	DeltaExpenses      int64   `gorm:"not null;default:0" json:"delta_expenses"`
	ResultingCashflow  int64   `gorm:"not null;default:0" json:"resulting_cashflow"`
	Description        *string `gorm:"type:text" json:"description,omitempty"`

	CreatedAt time.Time `json:"created_at"`
}
