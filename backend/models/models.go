package models

import (
	"time"

	"github.com/google/uuid"
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

type Player struct {
	ID uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`

	UserID uuid.UUID `gorm:"type:uuid;uniqueIndex;not null;index" json:"user_id"`

	GameID *uuid.UUID `gorm:"type:uuid;index" json:"game_id,omitempty"`
	Name   string     `gorm:"type:varchar(255);not null;default:''" json:"name"`

	ProfessionID *uuid.UUID `gorm:"type:uuid;index" json:"profession_id,omitempty"`

	Cash             int64 `gorm:"not null;default:0" json:"cash"`
	Salary           int64 `gorm:"not null;default:0" json:"salary"`
	PassiveIncome    int64 `gorm:"not null;default:0" json:"passive_income"`
	Expenses         int64 `gorm:"not null;default:0" json:"expenses"`
	AssetsTotal      int64 `gorm:"not null;default:0" json:"assets_total"`
	LiabilitiesTotal int64 `gorm:"not null;default:0" json:"liabilities_total"`

	ChildrenCount int `gorm:"not null;default:0" json:"children_count"`
	CharityTurns  int `gorm:"not null;default:0" json:"charity_turns"`
	SkipTurns     int `gorm:"not null;default:0" json:"skip_turns"`
	Position      int `gorm:"not null;default:0" json:"position"`

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Asset struct {
	ID uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`

	Name   string `gorm:"type:varchar(255);not null" json:"name"`
	Type   string `gorm:"type:varchar(30);not null;index" json:"type"` // stocks, real_estate, business, other
	Price  int64  `gorm:"not null" json:"price"`
	Income int64  `gorm:"not null;default:0" json:"income"` // treat as monthly cashflow from this asset

	GameID      *uuid.UUID `gorm:"type:uuid;index" json:"game_id,omitempty"`
	DownPayment int64      `gorm:"not null;default:0" json:"down_payment"`
	Mortgage    int64      `gorm:"not null;default:0" json:"mortgage"`

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
	Seller      Player      `gorm:"-:migration" json:"seller,omitempty"` // derived

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
	Name       string    `gorm:"type:varchar(255);not null" json:"name"`
	MaxPlayers int       `gorm:"not null" json:"max_players"`
	CreatedBy  uuid.UUID `gorm:"type:uuid;not null;index" json:"created_by"`

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

	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type SmallDeal struct {
	ID uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`

	DealType    string  `gorm:"type:varchar(30);not null;index" json:"deal_type"`
	Name        string  `gorm:"type:varchar(255);not null" json:"name"`
	Price       int64   `gorm:"not null" json:"price"`
	DownPayment int64   `gorm:"not null;default:0" json:"down_payment"`
	Mortgage    int64   `gorm:"not null;default:0" json:"mortgage"`
	Cashflow    int64   `gorm:"not null;default:0" json:"cashflow"`
	ROI         float64 `gorm:"type:numeric(10,2);not null;default:0" json:"roi"`
}

type BigDeal struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Name        string    `gorm:"type:varchar(255);not null" json:"name"`
	Price       int64     `gorm:"not null" json:"price"`
	DownPayment int64     `gorm:"not null;default:0" json:"down_payment"`
	Mortgage    int64     `gorm:"not null;default:0" json:"mortgage"`
	Cashflow    int64     `gorm:"not null;default:0" json:"cashflow"`
	ROI         float64   `gorm:"type:numeric(10,2);not null;default:0" json:"roi"`
}

type MarketEvent struct {
	ID          uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Name        string    `gorm:"type:varchar(255);not null" json:"name"`
	Description string    `gorm:"type:text;not null;default:''" json:"description"`
}

type Doodad struct {
	ID   uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	Name string    `gorm:"type:varchar(255);not null" json:"name"`
	Cost int64     `gorm:"not null;default:0" json:"cost"`
}

type FinancialLog struct {
	ID       uuid.UUID `gorm:"type:uuid;primaryKey;default:gen_random_uuid()" json:"id"`
	GameID   uuid.UUID `gorm:"type:uuid;not null;index" json:"game_id"`
	PlayerID uuid.UUID `gorm:"type:uuid;not null;index" json:"player_id"`

	Amount      int64   `gorm:"not null" json:"amount"`
	Type        string  `gorm:"type:varchar(50);not null;index" json:"type"`
	Description *string `gorm:"type:text" json:"description,omitempty"`

	CreatedAt time.Time `json:"created_at"`
}
