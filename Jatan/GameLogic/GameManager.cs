﻿using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using Jatan.Core;
using Jatan.Models;

namespace Jatan.GameLogic
{
    /// <summary>
    /// An instance of a game of Jatan. This class should contain every bit of information needed for the game.
    /// </summary>
    public class GameManager
    {
        private GameBoard _gameBoard;
        private GameSettings _gameSettings;
        private List<Player> _players;
        private int _playerTurnIndex;
        private CardDeck<DevelopmentCards> _developmentCardDeck;
        private GameState _gameState;
        private PlayerTurnState _playerTurnState;
        private Dice _dice;
        private RollResult _currentDiceRoll;
        private TradeHelper _tradeHelper;
        private Dictionary<Player, int> _playersCardsToLose;
        private List<Player> _playersToStealFrom;
        private int _roadBuildingRoadsRemaining;

        // <playerId, roadLength>
        private Tuple<int, int> _longestRoad; 
        // <playerId, armySize>
        private Tuple<int, int> _largestArmy;

        private int _idCounter;

        #region public properties

        /// <summary>
        /// Gets the game board.
        /// </summary>
        public GameBoard GameBoard
        {
            get { return _gameBoard; }
        }

        /// <summary>
        /// Gets the game settings.
        /// </summary>
        public GameSettings Settings
        {
            get {  return _gameSettings; }
        }

        /// <summary>
        /// Gets the number of players.
        /// </summary>
        public int NumberOfPlayers
        {
            get { return _players.Count; }
        }

        /// <summary>
        /// Gets the current state of the game.
        /// </summary>
        public GameState GameState
        {
            get { return _gameState; }
        }

        /// <summary>
        /// Gets the state of the active player's turn.
        /// </summary>
        public PlayerTurnState PlayerTurnState
        {
            get { return _playerTurnState; }
        }

        /// <summary>
        /// Gets the player whose turn it currently is.
        /// </summary>
        public Player ActivePlayer
        {
            get
            {
                if (_playerTurnIndex >= 0 && _playerTurnIndex < _players.Count)
                    return _players[_playerTurnIndex];
                return null;
            }
        }

        /// <summary>
        /// Returns true if the last player has placed a building during the initial placement phase.
        /// </summary>
        public bool LastPlayerHasPlaced
        {
            get { return _gameBoard.GetBuildingCountForPlayer(_players.Last().Id) > 0; }
        }

        /// <summary>
        /// Returns true if the "last" player is currently active.
        /// </summary>
        public bool LastPlayerIsActive
        {
            get { return _playerTurnIndex == _players.Count - 1; }
        }

        /// <summary>
        /// Gets a copy of the player list.
        /// </summary>
        public List<Player> Players
        {
            get { return new List<Player>(_players); }
        }

        /// <summary>
        /// Gets a list of players who need to discard cards.
        /// </summary>
        public List<Player> PlayersSelectingCardsToLose
        {
            get { return new List<Player>(_playersCardsToLose.Keys); }
        }

        /// <summary>
        /// Gets a list of players which can currently be robbed.
        /// </summary>
        public List<Player> PlayersAvailableToRob
        {
            get {  return new List<Player>(_playersToStealFrom); }
        }

        /// <summary>
        /// Gets the current player scores.
        /// </summary>
        public Dictionary<int, int> PlayerScores
        {
            get
            {
                var result = new Dictionary<int, int>();
                foreach (var p in Players)
                {
                    var points = GetTotalPointsForPlayer(p.Id);
                    if (points.Succeeded)
                        result.Add(p.Id, points.Data);
                }
                return result;
            }
            
        }

        /// <summary>
        /// Gets the current dice roll value. If there is none, this will return null.
        /// </summary>
        public RollResult CurrentDiceRoll
        {
            get { return _currentDiceRoll; }
        }

        #endregion

        /// <summary>
        /// Creates a new game instance.
        /// </summary>
        public GameManager()
        {
            _gameSettings = new GameSettings();
            _gameState = GameState.NotStarted;
            _playerTurnState = PlayerTurnState.None;
            _gameBoard = new GameBoard();
            _players = new List<Player>();
            _developmentCardDeck = new CardDeck<DevelopmentCards>();
            _dice = new Dice();
            _tradeHelper = new TradeHelper();
            _playersCardsToLose = new Dictionary<Player, int>();
            _playersToStealFrom = new List<Player>();
            _idCounter = 0;
        }

        /// <summary>
        /// Starts a brand new game.
        /// </summary>
        public void StartNewGame(IEnumerable<Player> players)
        {
            _players.Clear();
            _players.AddRange(players);
            StartNewGame();
        }

        /// <summary>
        /// Starts a brand new game with the current players.
        /// </summary>
        public void StartNewGame()
        {
            _playerTurnIndex = 0; // The first person in the list goes first.
            _longestRoad = Tuple.Create(-1, -1);
            _largestArmy = Tuple.Create(-1, -1);
            SetupDevelopmentCards();
            _gameBoard.Setup();
            _gameBoard.RobberMode = _gameSettings.RobberMode;
            _roadBuildingRoadsRemaining = 0;
            _dice.ClearLog();
            _currentDiceRoll = null;
            _playersCardsToLose.Clear();
            _playersToStealFrom.Clear();
            _tradeHelper.ClearAllOffers();
            _gameState = GameState.InitialPlacement;
            _playerTurnState = PlayerTurnState.PlacingSettlement; // TODO: Possibly wait for something to trigger the game start.
        }

        public void AddPlayer(string name)
        {
            _players.Add(new Player(_idCounter++, name, GetAvailableColor()));
        }

        #region public player methods

        /// <summary>
        /// Removes the specified player from the game.
        /// The removed player will keep their buildings and roads on the board.
        /// Also, A player that has left can still have the longest army or road, because there is
        /// not a good way to give the points to the next best player in the case of a tie.
        /// </summary>
        public ActionResult PlayerAbandonGame(int playerId)
        {
            if (_players == null || !_players.Any())
                return ActionResult.CreateFailed("There are no players to remove.");

            if (!_players.Select(p => p.Id).Contains(playerId))
                return ActionResult.CreateFailed("Player is not currently in this game.");

            // First, figure out which player we should select as active after this player leaves.
            Player playerToSetAsActive = null;
            bool isActivePlayer = (ActivePlayer != null && ActivePlayer.Id == playerId);
            if (isActivePlayer)
            {
                var nextPlayerIndex = (_playerTurnIndex + 1)%_players.Count;
                if (nextPlayerIndex < _players.Count)
                    playerToSetAsActive = _players[nextPlayerIndex];
            }
            else
            {
                playerToSetAsActive = this.ActivePlayer;
            }

            // Remove player from internal players list
            _players.RemoveAll(p => p.Id == playerId);

            if (_gameState == GameState.GameInProgress)
            {
                _playerTurnIndex = _players.IndexOf(playerToSetAsActive);

                if (isActivePlayer)
                {
                    // The player leaving is the active player.

                    _tradeHelper.ClearAllOffers();
                    _roadBuildingRoadsRemaining = 0;
                    _currentDiceRoll = null;

                    // Go to next player's turn.
                    _playerTurnState = PlayerTurnState.NeedToRoll;
                }
                else // The player leaving is a non-active player
                {
                    _tradeHelper.CancelCounterOffer(playerId);
                }
            }
            else if (_gameState == GameState.InitialPlacement)
            {
                // If a player leaves during initial placement, just restart the game.
                StartNewGame();
            }

            return ActionResult.CreateSuccess();
        }

        /// <summary>
        /// Rolls the dice and handles resources/robber logic. Can only be called by the active player.
        /// </summary>
        public ActionResult<RollResult> PlayerRollDice(int playerId)
        {
            var validation = ValidatePlayerAction(PlayerTurnState.NeedToRoll, playerId);
            if (validation.Failed) return validation.ToGeneric<RollResult>();

            var diceRoll = _dice.Roll();

            // If the roll is a 7, then we do special logic to make players
            // lose cards and we let the active player place the robber.
            if (diceRoll.Total == 7)
            {
                // Possibly make players lose cards
                ComputePlayersCardsToLose();
                if (_playersCardsToLose.Any())
                {
                    // Some players need to lose cards. Change player state.
                    // We will stay in this state until the unlucky players have selected cards to lose.
                    _playerTurnState = PlayerTurnState.AnyPlayerSelectingCardsToLose;
                }
                else
                {
                    // No players need to lose any cards. Immediately let the player move the robber.
                    _playerTurnState = _gameSettings.RobberMode == RobberMode.None ? PlayerTurnState.TakeAction : PlayerTurnState.PlacingRobber;
                }
            }
            else
            {
                // Give resources
                var allResources = _gameBoard.GetResourcesForDiceRoll(diceRoll.Total);
                foreach (var resources in allResources)
                {
                    var playerResult = GetPlayerFromId(resources.Key);
                    if (playerResult.Succeeded && playerResult.Data != null)
                    {
                        var player = playerResult.Data;
                        var newResourcesForPlayer = resources.Value;
                        player.AddResources(newResourcesForPlayer);
                    }
                }

                // Nothing special to do, just advance to next turn state.
                _playerTurnState = PlayerTurnState.TakeAction;
            }

            // Save the current roll so we can pass it along to other players.
            _currentDiceRoll = diceRoll;

            return ActionResult<RollResult>.CreateSuccess(diceRoll);
        }

        /// <summary>
        /// Makes a certain player discard resources. Used when a 7 is rolled
        /// and the player has too many cards. Can be called by any player.
        /// </summary>
        public ActionResult PlayerDiscardResources(int playerId, ResourceCollection toDiscard)
        {
            var validation = ValidatePlayerAction(PlayerTurnState.AnyPlayerSelectingCardsToLose);
            if (validation.Failed) return validation;

            var apr = GetPlayerFromId(playerId);
            if (apr.Failed) return apr;
            var player = apr.Data;

            if (!_playersCardsToLose.ContainsKey(player))
                return ActionResult.CreateFailed("Discarding resources is not required.");

            var toDiscardCount = toDiscard.GetResourceCount();
            var requiredCount = _playersCardsToLose[player];
            if (toDiscardCount != requiredCount)
                return ActionResult.CreateFailed(string.Format("Incorrect number of cards to discard. Selected: {0}. Required: {1}.", toDiscardCount, requiredCount));

            if(!player.RemoveResources(toDiscard))
                return ActionResult.CreateFailed("Player does not have the cards selected to discard.");

            // Success. Remove player from pending discard list.
            _playersCardsToLose.Remove(player);

            // If the player-discard list is empty now, let the active player place the robber.
            if (_playersCardsToLose.Count == 0)
            {
                _playerTurnState = _gameSettings.RobberMode == RobberMode.None ? PlayerTurnState.TakeAction : PlayerTurnState.PlacingRobber;
            }

            return ActionResult.CreateSuccess();
        }

        /// <summary>
        /// Moves the robber to a new location. Can only be called by the active player.
        /// </summary>
        public ActionResult PlayerMoveRobber(int playerId, Hexagon newLocation)
        {
            var validation = ValidatePlayerAction(PlayerTurnState.PlacingRobber, playerId);
            if (validation.Failed) return validation;

            var apr = GetPlayerFromId(playerId);
            if (apr.Failed) return apr;
            var activePlayer = apr.Data;

            var moveResult = _gameBoard.MoveRobber(playerId, newLocation);
            if (moveResult.Failed) return moveResult;

            // Success. Check for nearby players which can be robbed.
            var touchingPlayers = moveResult.Data;
            if (touchingPlayers != null && touchingPlayers.Any())
            {
                var playersWithCards = FilterOutPlayersWithNoCards(touchingPlayers.Where(pid => pid != playerId));
                if (playersWithCards.Any())
                {
                    _playersToStealFrom.Clear();
                    _playersToStealFrom.AddRange(playersWithCards);
                    _playerTurnState = PlayerTurnState.SelectingPlayerToStealFrom;
                }
                else
                {
                    // No one to steal from.
                    _playerTurnState = PlayerTurnState.TakeAction;
                }
            }
            else
            {
                _playerTurnState = PlayerTurnState.TakeAction;
            }

            return ActionResult.CreateSuccess();
        }

        /// <summary>
        /// Steals a random resource card from a player. Initiated by moving the robber.
        /// Can only be called by the main player. On success, returns the stolen card.
        /// </summary>
        public ActionResult<ResourceTypes> PlayerStealResourceCard(int playerId, int robbedPlayerId)
        {
            var validation = ValidatePlayerAction(PlayerTurnState.SelectingPlayerToStealFrom, playerId);
            if (validation.Failed) return validation.ToGeneric<ResourceTypes>();

            var apr = GetPlayerFromId(playerId);
            if (apr.Failed) return apr.ToGeneric<ResourceTypes>();
            var activePlayer = apr.Data;

            var pr = GetPlayerFromId(robbedPlayerId);
            if (pr.Failed) return pr.ToGeneric<ResourceTypes>();
            var robbedPlayer = pr.Data;

            if (_playersToStealFrom.All(p => p.Id != robbedPlayerId))
                return ActionResult.CreateFailed("This player cannot be robbed.").ToGeneric<ResourceTypes>();

            if (robbedPlayer.NumberOfResourceCards == 0)
                return ActionResult.CreateFailed("This player has no resource cards to steal.").ToGeneric<ResourceTypes>();

            var removeResult = robbedPlayer.ResourceCards.RemoveRandom();
            if (removeResult.Failed) return removeResult;

            // Success
            var typeStolen = removeResult.Data;
            activePlayer.ResourceCards[typeStolen]++;

            // Change player state
            _playerTurnState = PlayerTurnState.TakeAction;
            _playersToStealFrom.Clear();

            return new ActionResult<ResourceTypes>(typeStolen, true);
        }

        /// <summary>
        /// Offer a player-to-player trade with anyone. This can be immediately accepted or
        /// players can send counter-offers. Can only be called by the active player.
        /// </summary>
        public ActionResult PlayerOfferTrade(int playerId, TradeOffer tradeOffer)
        {
            var validation = ValidatePlayerAction(PlayerTurnState.TakeAction, playerId);
            if (validation.Failed) return validation;

            if (tradeOffer == null || !tradeOffer.IsValid)
            {
                return ActionResult.CreateFailed("Invalid trade offer.");
            }

            if (!ActivePlayer.HasAtLeast(tradeOffer.ToGive))
            {
                return ActionResult.CreateFailed("Cannot afford to create this trade offer.");
            }

            _tradeHelper.ClearAllOffers();
            tradeOffer.CreatorPlayerId = playerId; // Set the playerId manually just in case.
            _tradeHelper.ActivePlayerTradeOffer = tradeOffer;
            _playerTurnState = PlayerTurnState.RequestingPlayerTrade;

            return ActionResult.CreateSuccess();
        }

        /// <summary>
        /// Accepts a specific counter trade offer. Can only be called by the active player.
        /// </summary>
        public ActionResult PlayerAcceptCounterTradeOffer(int playerId, int counterOfferPlayerId)
        {
            var validation = ValidatePlayerAction(PlayerTurnState.RequestingPlayerTrade, playerId);
            if (validation.Failed) return validation;

            var apr = GetPlayerFromId(playerId);
            if (apr.Failed) return apr;
            var activePlayer = apr.Data;

            var pr = GetPlayerFromId(counterOfferPlayerId);
            if (pr.Failed) return pr;
            var counterOfferPlayer = pr.Data;

            var offer = _tradeHelper.GetCounterOfferByPlayerId(counterOfferPlayerId);
            if (offer == null)
            {
                return ActionResult.CreateFailed("The trade offer does not exist.");
            }

            var tradeResult = activePlayer.AcceptTradeOffer(counterOfferPlayer, offer);
            if (tradeResult.Failed) return tradeResult;

            // Go back to TakeAction player state
            _tradeHelper.ClearAllOffers();
            _playerTurnState = PlayerTurnState.TakeAction;

            return ActionResult.CreateSuccess();
        }

        /// <summary>
        /// Cancels a player's current trade offer.
        /// If called by the active player, cancels all trade offers and changes the turn state.
        /// If called by a non-active player, cancels a specific counter-offer.
        /// </summary>
        public ActionResult PlayerCancelTradeOffer(int playerId)
        {
            var validation = ValidatePlayerAction(PlayerTurnState.RequestingPlayerTrade);
            if (validation.Failed) return validation;

            if (ActivePlayer.Id == playerId)
            {
                // Go back to TakeAction player state
                _tradeHelper.ClearAllOffers();
                _playerTurnState = PlayerTurnState.TakeAction;
            }
            else
            {
                _tradeHelper.CancelCounterOffer(playerId);
            }

            return ActionResult.CreateSuccess();
        }

        /// <summary>
        /// Sends a counter trade offer to the active player. This can only be called by a non-active player.
        /// </summary>
        public ActionResult SendCounterTradeOffer(int playerId, TradeOffer counterOffer)
        {
            var validation = ValidatePlayerAction(PlayerTurnState.RequestingPlayerTrade);
            if (validation.Failed) return validation;

            var pr = GetPlayerFromId(playerId);
            if (pr.Failed) return pr;

            if (counterOffer == null || !counterOffer.IsValid)
            {
                return ActionResult.CreateFailed("Invalid trade offer.");
            }

            counterOffer.CreatorPlayerId = playerId; // Set the playedId manually just in case.
            _tradeHelper.SendCounterOffer(counterOffer);

            return ActionResult.CreateSuccess();
        }

        /// <summary>
        /// Accept the active player's current trade. This can only be called by a non-active player.
        /// </summary>
        public ActionResult AcceptTradeFromActivePlayer(int playerId)
        {
            var validation = ValidatePlayerAction(PlayerTurnState.RequestingPlayerTrade);
            if (validation.Failed) return validation;

            var pr = GetPlayerFromId(playerId);
            if (pr.Failed) return pr;

            if (!_tradeHelper.HasActivePlayerTradeOffer)
            {
                return ActionResult.CreateFailed("There is no active trade offer to accept.");
            }

            // Check if the non-active player can afford to do the trade.
            var nonActivePlayer = pr.Data;
            var activeOffer = _tradeHelper.ActivePlayerTradeOffer;

            var result = nonActivePlayer.AcceptTradeOffer(ActivePlayer, activeOffer);
            if (result.Failed) return result;

            // Go back to TakeAction player state
            _tradeHelper.ClearAllOffers();
            _playerTurnState = PlayerTurnState.TakeAction;

            return ActionResult.CreateSuccess();
        }

        /// <summary>
        /// Trade with the bank or harbor. A 4:1 trade with the bank is always available.
        /// A 3:1 or 2:1 trade can be done depending on the player's harbors.
        /// Can only be called by the active player.
        /// </summary>
        public ActionResult PlayerTradeWithBank(int playerId, TradeOffer tradeOffer)
        {
            var validation = ValidatePlayerAction(PlayerTurnState.TakeAction, playerId);
            if (validation.Failed) return validation;

            var pr = GetPlayerFromId(playerId);
            if (pr.Failed) return pr;

            var player = pr.Data;
            var ports = _gameBoard.GetPortsForPlayer(playerId);

            return player.DoTradeWithBank(tradeOffer, ports);
        }

        /// <summary>
        /// Makes a player buy a development card and places it into their hand. Returns the bought card.
        /// </summary>
        public ActionResult<DevelopmentCards> PlayerBuyDevelopmentCard(int playerId)
        {
            var validation = ValidatePlayerAction(PlayerTurnState.TakeAction, playerId);
            if (validation.Failed) return validation.ToGeneric<DevelopmentCards>();

            var pr = GetPlayerFromId(playerId);
            if (pr.Failed) pr.ToGeneric<DevelopmentCards>();
            var player = pr.Data;

            if (!player.CanAfford(PurchasableItems.DevelopmentCard))
                return ActionResult<DevelopmentCards>.CreateFailed("Cannot afford this.");

            var drawResult = _developmentCardDeck.DrawCard();
            if (drawResult.Failed) return drawResult;
            var card = drawResult.Data;

            var buyResult = player.Purchase(PurchasableItems.DevelopmentCard); // This should work, because we know the player can afford it.
            System.Diagnostics.Debug.Assert(buyResult.Succeeded);

            // Everything worked. Give the card to the player.
            player.DevelopmentCards.Add(card);

            return ActionResult<DevelopmentCards>.CreateSuccess(card);
        }

        /// <summary>
        /// Causes the player to enter the placing road state. This action does
        /// not cost any resources, but the player must have enough for a road.
        /// </summary>
        public ActionResult PlayerBeginPlacingRoad(int playerId)
        {
            var validation = ValidatePlayerAction(PlayerTurnState.TakeAction, playerId);
            if (validation.Failed) return validation;

            var pr = GetPlayerFromId(playerId);
            if (pr.Failed) return pr;
            var player = pr.Data;

            if (!player.CanAfford(PurchasableItems.Road))
                return ActionResult.CreateFailed("Cannot afford a road.");

            // Enter the placing road state.
            _playerTurnState = PlayerTurnState.PlacingRoad;

            return ActionResult.CreateSuccess();
        }

        /// <summary>
        /// Places a road for the given player at the given location.
        /// If it's the initial placement phase of the game, the road is free.
        /// Otherwise, resources will be removed from the player.
        /// </summary>
        public ActionResult PlayerPlaceRoad(int playerId, HexEdge location)
        {
            var validation = ValidatePlayerAction(PlayerTurnState.PlacingRoad, playerId);
            if (validation.Failed) return validation;

            var pr = GetPlayerFromId(playerId);
            if (pr.Failed) return pr;
            var player = pr.Data;

            bool startOfGame = (_gameState == GameState.InitialPlacement);

            // Make sure the player doesn't place too many roads in the intial placement phase
            if (startOfGame)
            {
                var buildingCount = _gameBoard.GetBuildingCountForPlayer(playerId);
                var roadCount = _gameBoard.GetRoadCountForPlayer(playerId);
                var maxRoads = buildingCount;
                if (roadCount >= maxRoads)
                    return ActionResult.CreateFailed("Cannot place more than 1 road per settlement during the initial placement phase.");
            }

            var placementValidation = _gameBoard.ValidateRoadPlacement(playerId, location, startOfGame);
            if (placementValidation.Failed) return placementValidation;

            var purchaseResult = player.Purchase(PurchasableItems.Road, startOfGame);
            if (purchaseResult.Failed) return purchaseResult;

            // We'll assume this succeeds because we already validated it.
            var placement = _gameBoard.PlaceRoad(player.Id, location, startOfGame);
            System.Diagnostics.Debug.Assert(placement.Succeeded);

            // When we place a road, do a check to see if we deserve the longest road.
            CheckForLongestRoad(playerId);

            // Update game and player states.
            if (_gameState == GameState.InitialPlacement)
            {
                var buildingCount = _gameBoard.GetBuildingCountForPlayer(playerId);
                if (LastPlayerIsActive && buildingCount == 1)
                {
                    // The "last" player gets to place twice.
                    _playerTurnState = PlayerTurnState.PlacingSettlement;
                }
                else
                {
                    // Go to the next players turn.
                    AdvanceToNextPlayerTurn();
                }
            }
            else if (_gameState == GameState.GameInProgress)
            {
                _playerTurnState = PlayerTurnState.TakeAction;
            }

            return ActionResult.CreateSuccess();
        }

        /// <summary>
        /// Causes the player to enter the placing settlement or city state. This action does
        /// not cost any resources, but the player must be able to afford the item.
        /// </summary>
        public ActionResult PlayerBeginPlacingBuilding(int playerId, BuildingTypes type)
        {
            var validation = ValidatePlayerAction(PlayerTurnState.TakeAction, playerId);
            if (validation.Failed) return validation;

            var pr = GetPlayerFromId(playerId);
            if (pr.Failed) return pr;
            var player = pr.Data;

            if (type == BuildingTypes.Settlement)
            {
                if (!player.CanAfford(PurchasableItems.Settlement))
                    return ActionResult.CreateFailed("Cannot afford a settlement.");

                // There must be at least one valid space on the board to build.
                if (!GetLegalBuildingPlacements(playerId, type).Any())
                    return ActionResult.CreateFailed("There are no valid locations to build a settlement.");

                // Enter the placing settlement state.
                _playerTurnState = PlayerTurnState.PlacingSettlement;
            }
            else if (type == BuildingTypes.City)
            {
                if (!player.CanAfford(PurchasableItems.City))
                    return ActionResult.CreateFailed("Cannot afford a city.");

                // There must be at least one valid space on the board to build.
                if (!GetLegalBuildingPlacements(playerId, type).Any())
                    return ActionResult.CreateFailed("There are no valid locations to build a city.");

                // Enter the placing settlement state.
                _playerTurnState = PlayerTurnState.PlacingCity;
            }

            return ActionResult.CreateSuccess();
        }

        /// <summary>
        /// Places a building for the given player at the given location.
        /// If it's the start of the game, the building is free.
        /// Otherwise, resources will be removed from the player.
        /// </summary>
        public ActionResult PlayerPlaceBuilding(int playerId, BuildingTypes type, HexPoint location)
        {
            var requiredState = (type == BuildingTypes.City) ? PlayerTurnState.PlacingCity : PlayerTurnState.PlacingSettlement;
            var validation = ValidatePlayerAction(requiredState, playerId);
            if (validation.Failed) return validation;

            var pr = GetPlayerFromId(playerId);
            if (pr.Failed) return pr;
            var player = pr.Data;

            bool startOfGame = (_gameState == GameState.InitialPlacement);

            // Make sure the player doesn't place too many buildings in the intial placement phase
            if (startOfGame)
            {
                if (type != BuildingTypes.Settlement)
                    return ActionResult.CreateFailed("Can only place settlements during the initial placement phase.");

                var buildingCount = _gameBoard.GetBuildingCountForPlayer(playerId);
                var maxBuildingCount = (LastPlayerHasPlaced) ? 2 : 1;
                if (buildingCount >= maxBuildingCount)
                    return ActionResult.CreateFailed("Cannot place any more settlements during the initial placement phase.");
            }

            var placementValidation = _gameBoard.ValidateBuildingPlacement(playerId, type, location, startOfGame);
            if (placementValidation.Failed) return placementValidation;

            PurchasableItems itemToBuy = (type == BuildingTypes.City) ? PurchasableItems.City : PurchasableItems.Settlement;

            var purchaseResult = player.Purchase(itemToBuy, startOfGame);
            if (purchaseResult.Failed) return purchaseResult;

            // We'll assume this succeeds because we already validated it.
            var placement = _gameBoard.PlaceBuilding(player.Id, type, location, startOfGame);
            System.Diagnostics.Debug.Assert(placement.Succeeded);

            // Update game and player states.
            if (startOfGame)
            {
                var buildingCount = _gameBoard.GetBuildingCountForPlayer(playerId);
                if (buildingCount == 2)
                {
                    // We've played the second building during the setup phase. Collect resources.
                    var resources = _gameBoard.GetResourcesForBuilding(location, BuildingTypes.Settlement);
                    player.ResourceCards.Add(resources);
                }

                _playerTurnState = PlayerTurnState.PlacingRoad;
            }
            else if (_gameState == GameState.GameInProgress)
            {
                _playerTurnState = PlayerTurnState.TakeAction;
            }

            return ActionResult.CreateSuccess();
        }

        /// <summary>
        /// Plays a development card for a player and performs any actions due to the card.
        /// </summary>
        public ActionResult PlayerPlayDevelopmentCard(int playerId, DevelopmentCards cardToPlay)
        {
            var validation = ValidatePlayerAction(PlayerTurnState.TakeAction, playerId);
            if (validation.Failed) return validation;

            var pr = GetPlayerFromId(playerId);
            if (pr.Failed) return pr;
            var player = pr.Data;

            var dr = player.PlayDevelopmentCard(cardToPlay);
            if (dr.Failed) return dr;

            if (cardToPlay == DevelopmentCards.Knight)
            {
                // Check if the player now has the largest army.
                var newArmySize = player.ArmySize;
                // Must be at least 3 knights to have the largest army.
                if (newArmySize >= 3 && newArmySize > _largestArmy.Item2)
                    _largestArmy = Tuple.Create(playerId, newArmySize);

                // Now let the player place the robber.
                _playerTurnState = _gameSettings.RobberMode == RobberMode.None ? PlayerTurnState.TakeAction : PlayerTurnState.PlacingRobber;
            }
            else if (cardToPlay == DevelopmentCards.Library || cardToPlay == DevelopmentCards.Chapel || cardToPlay == DevelopmentCards.Market || cardToPlay == DevelopmentCards.University || cardToPlay == DevelopmentCards.GreatHall)
            {
                // VP card. Do nothing.
            }
            else if (cardToPlay == DevelopmentCards.Monopoly)
            {
                _playerTurnState = PlayerTurnState.MonopolySelectingResource;
            }
            else if (cardToPlay == DevelopmentCards.YearOfPlenty)
            {
                _playerTurnState = PlayerTurnState.YearOfPlentySelectingResources;
            }
            else if (cardToPlay == DevelopmentCards.RoadBuilding)
            {
                _roadBuildingRoadsRemaining = 2;
                _playerTurnState = PlayerTurnState.RoadBuildingSelectingRoads;
            }

            return ActionResult.CreateSuccess();
        }

        /// <summary>
        /// Selects the resource type after the Monopoly card is played. Can only be called by the active player.
        /// </summary>
        public ActionResult PlayerSelectResourceForMonopoly(int playerId, ResourceTypes resource)
        {
            var validation = ValidatePlayerAction(PlayerTurnState.MonopolySelectingResource, playerId);
            if (validation.Failed) return validation;

            var pr = GetPlayerFromId(playerId);
            if (pr.Failed) return pr;
            var activePlayer = pr.Data;

            // Remove all the resources of the specified type from
            // the other players and give them to the active player.
            var otherPlayers = Players.Where(p => p.Id != playerId);
            var resCount = 0;
            foreach (var otherPlayer in otherPlayers)
            {
                resCount += otherPlayer.RemoveAllResources(resource);
            }
            activePlayer.ResourceCards[resource] += resCount;

            _playerTurnState = PlayerTurnState.TakeAction;

            return ActionResult.CreateSuccess();
        }

        /// <summary>
        /// Selects the two resources after the YearOfPlenty card is played. Can only be called by the active player.
        /// </summary>
        public ActionResult PlayerSelectResourcesForYearOfPlenty(int playerId, ResourceTypes res1, ResourceTypes res2)
        {
            var validation = ValidatePlayerAction(PlayerTurnState.YearOfPlentySelectingResources, playerId);
            if (validation.Failed) return validation;

            var pr = GetPlayerFromId(playerId);
            if (pr.Failed) return pr;
            var activePlayer = pr.Data;

            activePlayer.ResourceCards[res1]++;
            activePlayer.ResourceCards[res2]++;

            _playerTurnState = PlayerTurnState.TakeAction;

            return ActionResult.CreateSuccess();
        }

        /// <summary>
        /// Places a road for the given player at the given location after the RoadBuilding card has been played.
        /// Can only be called by the active player.
        /// </summary>
        public ActionResult PlayerPlaceRoadForRoadBuilding(int playerId, HexEdge location)
        {
            var validation = ValidatePlayerAction(PlayerTurnState.RoadBuildingSelectingRoads, playerId);
            if (validation.Failed) return validation;

            var pr = GetPlayerFromId(playerId);
            if (pr.Failed) return pr;
            var player = pr.Data;

            // Make sure the player doesn't place too many roads
            if (_roadBuildingRoadsRemaining <= 0)
                return ActionResult.CreateFailed("Cannot place more than 2 roads with the RoadBuilding card.");

            var placementValidation = _gameBoard.ValidateRoadPlacement(playerId, location, false);
            if (placementValidation.Failed) return placementValidation;

            var purchaseResult = player.Purchase(PurchasableItems.Road, true);
            if (purchaseResult.Failed)
            {
                // If this failed, it means that the player has no more roads available. This turn state has to end.
                _roadBuildingRoadsRemaining = 0;
                _playerTurnState = PlayerTurnState.TakeAction;
                return purchaseResult;
            }

            var rr = _gameBoard.PlaceRoad(player.Id, location, false);
            if (rr.Failed) return rr;
            
            // When we place a road, do a check to see if we deserve the longest road.
            CheckForLongestRoad(playerId);

            _roadBuildingRoadsRemaining--;
            if (_roadBuildingRoadsRemaining <= 0)
            {
                _playerTurnState = PlayerTurnState.TakeAction;
            }

            return ActionResult.CreateSuccess();
        }

        /// <summary>
        /// Ends a players turn during the normal game phase.
        /// </summary>
        public ActionResult PlayerEndTurn(int playerId)
        {
            var validation = ValidatePlayerAction(PlayerTurnState.TakeAction, playerId);
            if (validation.Failed) return validation;

            // Clear any trade offers, just in case.
            _tradeHelper.ClearAllOffers();
            _roadBuildingRoadsRemaining = 0;

            AdvanceToNextPlayerTurn();

            _currentDiceRoll = null;

            return ActionResult.CreateSuccess();
        }

        #endregion

        #region Public client helper methods

        /// <summary>
        /// Returns a list of all legal placements for a road for the given player.
        /// </summary>
        public List<HexEdge> GetLegalRoadPlacements(int playerId)
        {
            List<HexEdge> result = new List<HexEdge>();
            var edges = _gameBoard.GetAllBoardEdges();
            bool startOfGame = (_gameState == GameState.InitialPlacement);
            foreach (var edge in edges)
            {
                var placementResult = _gameBoard.ValidateRoadPlacement(playerId, edge, startOfGame);
                if (placementResult.Succeeded)
                {
                    result.Add(edge);
                }
            }
            return result;
        }

        /// <summary>
        /// Returns a list of all legal placements for a building for the given player.
        /// </summary>
        public List<HexPoint> GetLegalBuildingPlacements(int playerId, BuildingTypes type)
        {
            List<HexPoint> result = new List<HexPoint>();
            var points = _gameBoard.GetAllBoardPoints();
            bool startOfGame = (_gameState == GameState.InitialPlacement);
            foreach (var point in points)
            {
                var placementResult = _gameBoard.ValidateBuildingPlacement(playerId, type, point, startOfGame);
                if (placementResult.Succeeded)
                {
                    result.Add(point);
                }
            }
            return result;
        }

        #endregion

        #region private setup methods

        private void SetupDevelopmentCards()
        {
            _developmentCardDeck.Clear();
            var cardsToAdd = new List<DevelopmentCards>();
            
            cardsToAdd.Add(DevelopmentCards.Knight, 14);

            cardsToAdd.Add(DevelopmentCards.Library, 1);
            cardsToAdd.Add(DevelopmentCards.Chapel, 1);
            cardsToAdd.Add(DevelopmentCards.Market, 1);
            cardsToAdd.Add(DevelopmentCards.University, 1);
            cardsToAdd.Add(DevelopmentCards.GreatHall, 1);

            cardsToAdd.Add(DevelopmentCards.YearOfPlenty, 2);
            cardsToAdd.Add(DevelopmentCards.RoadBuilding, 2);
            cardsToAdd.Add(DevelopmentCards.Monopoly, 2);

            _developmentCardDeck.AddCards(cardsToAdd);
            _developmentCardDeck.Shuffle(5);
        }

        #endregion

        #region private helper methods

        private ActionResult ValidatePlayerAction(PlayerTurnState requiredState, int activePlayerId)
        {
            if (ActivePlayer == null || ActivePlayer.Id != activePlayerId)
                return ActionResult.CreateFailed("Not allowed to play out of turn.");

            return ValidatePlayerAction(requiredState);
        }

        private ActionResult ValidatePlayerAction(PlayerTurnState requiredState)
        {
            // Validates that the game and player are in the correct states to take the action.

            if (requiredState != _playerTurnState)
                return ActionResult.CreateFailed("Not allowed to take this action at this time.");

            bool validAction = true;
            switch (requiredState)
            {
                // The following actions can be taken during the initial placement phase or during the normal phase.
                case PlayerTurnState.PlacingRoad:
                case PlayerTurnState.PlacingSettlement:
                    validAction = (_gameState == GameState.GameInProgress || _gameState == GameState.InitialPlacement);
                    break;
                // The following actions require the normal game phase to be in progress.
                case PlayerTurnState.PlacingCity:
                case PlayerTurnState.NeedToRoll:
                case PlayerTurnState.PlacingRobber:
                case PlayerTurnState.RequestingPlayerTrade:
                case PlayerTurnState.AnyPlayerSelectingCardsToLose:
                case PlayerTurnState.SelectingPlayerToStealFrom:
                case PlayerTurnState.TakeAction:
                case PlayerTurnState.MonopolySelectingResource:
                case PlayerTurnState.RoadBuildingSelectingRoads:
                case PlayerTurnState.YearOfPlentySelectingResources:
                    validAction = (_gameState == GameState.GameInProgress);
                    break;
            }
            return validAction ? ActionResult.CreateSuccess() :
                                 ActionResult.CreateFailed("Not allowed to take this action at this time.");
        }

        private ActionResult<Player> GetPlayerFromId(int playerId)
        {
            var player = _players.FirstOrDefault(p => p.Id == playerId);
            if (player == null)
                return new ActionResult<Player>(null, false, "Player \"" + playerId + "\" does not exist.");
            return new ActionResult<Player>(player, true);
        }

        private void AdvanceToNextPlayerTurn()
        {
            // Advances to the next player's turn.
            if (_gameState == GameState.GameInProgress)
            {
                _playerTurnIndex = (_playerTurnIndex + 1) % _players.Count;
                _playerTurnState = PlayerTurnState.NeedToRoll;
            }
            else if (_gameState == GameState.InitialPlacement)
            {
                // During the initial placement phase, the turn index increases until the last player
                // makes his placements. Then, the turn index counts down to the first player.
                if (!LastPlayerHasPlaced)
                {
                    // The last player has not placed yet. Count up.
                    _playerTurnIndex++;
                    _playerTurnState = PlayerTurnState.PlacingSettlement;
                }
                else
                {
                    // The last player has gone. Count down.
                    _playerTurnIndex--;
                    
                    // If everyone has placed, start the game.
                    if (_playerTurnIndex < 0)
                    {
                        _playerTurnIndex = 0;
                        _gameState = GameState.GameInProgress;
                        _playerTurnState = PlayerTurnState.NeedToRoll;
                    }
                    else
                    {
                        _playerTurnState = PlayerTurnState.PlacingSettlement;
                    }
                }
                
            }
        }

        private void ComputePlayersCardsToLose()
        {
            // When a 7 is rolled, players will have to lose half (rounded down)
            // of their cards if they have more than a certain amount.
            // This method determines which players need to lose cards and how many.

            _playersCardsToLose.Clear();
            foreach (var p in Players)
            {
                if (p.NumberOfResourceCards >= _gameSettings.CardCountLossThreshold)
                {
                    int cardsToLose = (int)Math.Floor((double)p.NumberOfResourceCards / 2d);
                    _playersCardsToLose.Add(p, cardsToLose);
                }
            }
        }

        private IList<Player> FilterOutPlayersWithNoCards(IEnumerable<int> playerIds)
        {
            var resultPlayers = new List<Player>();
            foreach (var id in playerIds)
            {
                var pr = GetPlayerFromId(id);
                if (pr.Succeeded && pr.Data != null)
                {
                    var player = pr.Data;
                    if (player.NumberOfResourceCards > 0)
                    {
                        resultPlayers.Add(player);
                    }
                }
            }
            return resultPlayers;
        }

        private void CheckForLongestRoad(int playerId)
        {
            var newRoadLength = _gameBoard.GetRoadLengthForPlayer(playerId);
            // Must be at least 5 (by default) roads to have the longest road.
            if (newRoadLength >= _gameSettings.MinimumLongestRoad && newRoadLength > _longestRoad.Item2)
                _longestRoad = Tuple.Create(playerId, newRoadLength);
        }

        private ActionResult<int> GetTotalPointsForPlayer(int playerId)
        {
            var pr = GetPlayerFromId(playerId);
            if (pr.Failed) return pr.ToGeneric<int>();
            var player = pr.Data;

            // Ways to get points:
            // * 1 point per settlement.
            // * 2 points per city.
            // * From certain development cards.
            // * Longest Road (2 points) - Must be at least 5 segments.
            // * Largest Army (2 points) - Must be at least 3 knights.

            var settlementCount = _gameBoard.GetBuildingCountForPlayer(playerId, BuildingTypes.Settlement);
            var cityCount = _gameBoard.GetBuildingCountForPlayer(playerId, BuildingTypes.City);

            var totalPoints = 0;
            totalPoints += settlementCount;
            totalPoints += (cityCount * 2);
            totalPoints += player.VictoryPointsFromCards;
            if (_largestArmy.Item1 == playerId) totalPoints += 2;
            if (_longestRoad.Item1 == playerId) totalPoints += 2;

            return ActionResult<int>.CreateSuccess(totalPoints);
        }

        private PlayerColor GetAvailableColor()
        {
            // Gets an unused color for a player to use.
            // This method will only work when there are 4 or fewer players.
            var usedColors = this.Players.Select(p => p.Color).ToList();
            if (!usedColors.Contains(PlayerColor.Blue)) return PlayerColor.Blue;
            if (!usedColors.Contains(PlayerColor.Red)) return PlayerColor.Red;
            if (!usedColors.Contains(PlayerColor.Green)) return PlayerColor.Green;
            return PlayerColor.Yellow;
        }

        #endregion
    }
}
