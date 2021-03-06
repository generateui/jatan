﻿//========================================================================
// game.js --- This is where all of the client-side game code is located.
//========================================================================

var _serverGameHub = null; // signal-R hub
var _currentGameManager = null;
// Resource tiles and ports are not sent with every manager update, so we save a separate reference to them
var _currentResourceTiles = null;
var _currentPorts = null;

var _allResourcesLoaded = false;
var _loadQueue = null;
var _canvas = null;
var _stage = null;
var _water = null;
var _toastMessageContainer = null; // used to display important messages to the user
var _boardContainer = null;
var _boardTileContainer = null; // child to the board container
var _boardRoadContainer = null; // child to the board container
var _boardBuildingContainer = null; // child to the board container
var _boardRobber = null; // child to the board container
var _boardRobberMoving = null; // child to the board container
var _boardSelectItemsContainer = null; // child to the board container
var _boardLabelContainer = null; // child to the board container
var _invalidateCanvas = true; // set to true to redraw canvas on next animation frame

// Canvas to draw the user's cards on their HUD.
var _cardCanvas = null;
var _cardStage = null;
var _cardContainer = null;
var _selectedCards = [];
var _invalidateCardCanvas = true; // set to true to redraw the card canvas on next animation frame

// Canvas' to display cards to trade
var _tradeGiveCanvas = null;
var _tradeRecvCanvas = null;
var _tradeGiveStage = null;
var _tradeRecvStage = null;
var _tradeGiveCardContainer = null;
var _tradeRecvCardContainer = null;
var _tradeGiveSelectedCards = [];
var _tradeRecvSelectedCards = [];
var _invalidateTradeGiveCanvas = true;
var _invalidateTradeRecvCanvas = true;

// change this to allow the user to select various things on the UI
var _selectionMode = SelectionMode.None;

var _activeMouseButton = null;
var _boardDragMouseOffsetX = null;
var _boardDragMouseOffsetY = null;

var _toastMessageTimerId = 0;

var _hexToBeachMap = {}; // Populated when beach tiles are drawn
var _hexToResourceTileMap = {}; // Populated when resource tiles are drawn
var _selectableItemsMap = {}; // map of hexpoints and hexedges to their respective bitmaps
var _numberTileMap = {}; // map of retrieve numbers to list of numberTile containers.
var _portsPopulated = false;
var _resourceTilesPopulated = false;

$(function () {

    // disable contextmenu on all canvas
    $("body").on("contextmenu", "canvas", function (e) { return false; });

    _canvas = $("#gameCanvas")[0];
    
    // Set canvas sizes
    _cardCanvas = $("#cardCanvas")[0];
    _cardCanvas.width = _cardCanvas.clientWidth;
    _cardCanvas.height = _cardCanvas.clientHeight;
    _tradeGiveCanvas = $("#tradeGiveCanvas")[0];
    _tradeGiveCanvas.width = _tradeGiveCanvas.clientWidth;
    _tradeGiveCanvas.height = _tradeGiveCanvas.clientHeight;
    _tradeRecvCanvas = $("#tradeRecvCanvas")[0];
    _tradeRecvCanvas.width = _tradeRecvCanvas.clientWidth;
    _tradeRecvCanvas.height = _tradeRecvCanvas.clientHeight;

    initSignalR();
    initHtmlUI();
    loadGameResources();
});


//============================
// Init functions
//============================

function initSignalR() {
    // Declare a proxy to reference the hub.
    var gameHub = $.connection.gameHub;

    // Create a function that the hub can call to broadcast messages.
    gameHub.client.broadcastMessage = function (name, message) {
        writeTextToChat(name + ": " + message, ChatTextType.User);
    };

    gameHub.client.updateGameManager = function (gameManager) {
        updateGameModel(gameManager);
    };

    gameHub.client.newPlayerJoined = function (newPlayerName) {
        writeTextToChat(newPlayerName + " has joined the game.", ChatTextType.Info);
        _serverGameHub.getGameManagerUpdate(true); // A new player joined, so lets get a full game update.
    };

    gameHub.client.playerLeft = function (playerName) {
        writeTextToChat(playerName + " has left the game.", ChatTextType.Danger);
        _serverGameHub.getGameManagerUpdate(true); // A player left, so lets get a full game update.
    }

    gameHub.client.gameAborted = function () {
        writeTextToChat("*** The game has been shut down by the host ***", ChatTextType.Danger);
    };

    // Start the connection.
    $.connection.hub.start().done(function () {
        // save a reference to the server hub object.
        _serverGameHub = gameHub.server;

        initHubButtons();
        initGameManagerModel();
    });
}

function initGameManagerModel() {
    if (_serverGameHub != null && _allResourcesLoaded) {
        _serverGameHub.getGameManagerUpdate(true);
    } else {
        // If the server hub is not initialized or the game
        // resources are not loaded yet, keep retrying
        setTimeout(initGameManagerModel, 100);
    }
}

function initHubButtons() {
    $("#btnUpdateGameManager").click(function () {
        var fullUpdate = (!_portsPopulated || !_resourceTilesPopulated);
        _serverGameHub.getGameManagerUpdate(fullUpdate);
    });
    $("#btnStartGame").click(function () {
        _serverGameHub.startGame();
    });
    $("#btnRollDice").click(function () {
        _serverGameHub.rollDice().done(function (result) {
            if (!result["Succeeded"]) { // failed. display error message.
                displayToastMessage(result["Message"]);
            }
        });
    });
    $("#btnEndTurn").click(function () {
        _serverGameHub.endTurn().done(function (result) {
            if (!result["Succeeded"]) { // failed. display error message.
                displayToastMessage(result["Message"]);
            }
        });
    });
    $("#btnLeaveGame").click(function () {
        _serverGameHub.leaveGame();
    });
    // Buy buttons
    $("#btnBuyRoad").click(function () {
        _serverGameHub.beginBuyingRoad().done(function (result) {
            if (!result["Succeeded"]) { // failed. display error message.
                displayToastMessage(result["Message"]);
            }
        });
    });
    $("#btnBuySettlement").click(function () {
        _serverGameHub.beginBuyingBuilding(BuildingTypes.Settlement).done(function (result) {
            if (!result["Succeeded"]) { // failed. display error message.
                displayToastMessage(result["Message"]);
            }
        });
    });
    $("#btnBuyCity").click(function () {
        _serverGameHub.beginBuyingBuilding(BuildingTypes.City).done(function (result) {
            if (!result["Succeeded"]) { // failed. display error message.
                displayToastMessage(result["Message"]);
            }
        });
    });
    $("#btnBuyDevelopmentCard").click(function () {
        _serverGameHub.buyDevelopmentCard().done(function (result) {
            if (!result["Succeeded"]) { // failed. display error message.
                displayToastMessage(result["Message"]);
            }
        });
    });
}

function initHtmlUI() {

    // Init click handlers for selecting player boxes.
    $("#playerBox1").click(function () { playerBoxClicked(1); });
    $("#playerBox2").click(function () { playerBoxClicked(2); });
    $("#playerBox3").click(function () { playerBoxClicked(3); });
    $("#playerBox4").click(function () { playerBoxClicked(4); });

    $("#btnTradeWithBank").click(tradeBankClicked);
    $("#btnTradeWithPlayer").click(tradePlayerClicked);
    $(".trade-button-cancel").mouseup(function (event) {
        $(this).closest(".trade-dialog").addClass("hidden");
    });
    $(".trade-button-ok").click(tradeOkClicked);
    $(".trade-canvas-button").click(tradeCanvasButtonClicked);

    // Show chat input box when the enter key is pressed.
    $(document).keydown(function (event) {
        var keycode = (event.keyCode ? event.keyCode : event.which);
        if (keycode === 13) { // Enter key pressed
            var $inputBox = $("#chatInputBox");
            var $inputText = $("#chatInputText");
            if ($inputBox.hasClass("hidden")) { // the chat input is not showing
                $inputBox.removeClass("hidden");
                $inputText.focus();
            } else { // the chat input is visible.
                var msgToSend = $inputText.val().trim();
                if (_serverGameHub != null && msgToSend.length > 0) {
                    _serverGameHub.sendChatMessage(msgToSend);
                }
                $inputText.val("");
                $inputBox.addClass("hidden");
                $("#gameCanvas").focus();
            }
            // suppress the enter key from affecting anything else.
            return false;
        }
        else if (keycode === 27) { // escape key pressed. Close the chat window if its showing.
            var $inputBox = $("#chatInputBox");
            var $inputText = $("#chatInputText");
            if ($inputBox.hasClass("hidden") === false) { // chat input is showing
                $inputText.val("");
                $inputBox.addClass("hidden");
                $("#gameCanvas").focus();
                return false;
            }
            // Hide trade dialogs if they are showing.
            $("#tradeDialog").addClass("hidden");
        }
        return true;
    });
}

function playerBoxClicked(boxId) {
    if (_serverGameHub == null || _currentGameManager == null)
        return;

    var turnState = _currentGameManager["PlayerTurnState"];
    var players = _currentGameManager["Players"];
    var playerId = _currentGameManager["MyPlayerId"];
    var activePlayerId = _currentGameManager["ActivePlayerId"];
    if (turnState == null || players == null || playerId === null || activePlayerId == null) return;

    if (playerId === activePlayerId && turnState === PlayerTurnState.SelectingPlayerToStealFrom) {
        var robbedPlayerIndex = boxId - 1;
        if (robbedPlayerIndex >= 0 && robbedPlayerIndex < players.length) {
            var robbedPlayer = players[robbedPlayerIndex];
            var robbedId = robbedPlayer["Id"];
            if (robbedId != null && robbedId !== playerId) {
                // Call the server hub method
                _serverGameHub.stealResourceCard(robbedId).done(function (result) {
                    if (!result["Succeeded"]) { // failed. display error message.
                        displayToastMessage(result["Message"]);
                    }
                });
            }
        }
    }
}

function tradeBankClicked() {
    if (_currentGameManager == null) return;
    
    if ($("#tradeDialog").hasClass("hidden")) {
        // dialog is not showing yet.
        $("#tradeDialog").removeClass("hidden");
        
        // Init the trade controls.
        

    } else {
        // dialog is already showing.
        $("#tradeDialog").addClass("hidden");
    }
}

function tradePlayerClicked() {
    // TODO
}

function tradeCanvasButtonClicked(event) {
    var obj = event.target;
    var objId = obj.id;
    var toGive = (objId.indexOf("Give") > -1);
    var resType = null;
    var resNames = Object.keys(NameToResourceTypeMap);
    for (var i = 0; i < resNames.length; i++) {
        var resName = resNames[i];
        if (objId.indexOf(resName) > 0) {
            resType = NameToResourceTypeMap[resName];
            break;
        }
    }
    if (resType == null)
        return;

    // TODO
}

function tradeOkClicked() {
    // TODO
}

function loadGameResources() {
    _loadQueue = new createjs.LoadQueue();
    _loadQueue.on("complete", onLoadQueueCompleted);
    _loadQueue.on("progress", onLoadQueueProgressChanged);
    var resourceKeys = Object.keys(_assetMap);
    for (var i = 0; i < resourceKeys.length; i++) {
        var resKey = resourceKeys[i];
        _loadQueue.loadFile({ id: resKey, src: _assetMap[resKey].src });
    }
}

function onLoadQueueProgressChanged(event) {
    var progressString = (Math.floor(100 * event.progress)).toString() + "%";
    $("#percentLoadedText").text(progressString);
    $("#resourceProgressBar").css("width", progressString);
}

function onLoadQueueCompleted(event) {
    $("#percentLoadedText").text("Done!");

    // put loaded resources into resource map
    var resourceKeys = Object.keys(_assetMap);
    for (var i = 0; i < resourceKeys.length; i++) {
        var resKey = resourceKeys[i];
        var result = _loadQueue.getResult(resKey);
        if (result) {
            _assetMap[resKey].data = result;
        }
    }

    // wait a second so the user can see that it completed
    setTimeout(completedLoading, 50);
}

function completedLoading() {
    $("#loadingResourcesDiv").hide();
    initCanvasStage();
    _allResourcesLoaded = true;

    // Show the chat box after resources have loaded.
    $("#chatMessagesBox").removeClass("hidden");
}

function initCanvasStage() {

    // Create stages for trading
    _tradeGiveStage = new createjs.Stage("tradeGiveCanvas");
    _tradeRecvStage = new createjs.Stage("tradeRecvCanvas");
    _tradeGiveCardContainer = new createjs.Container();
    _tradeRecvCardContainer = new createjs.Container();
    _tradeGiveStage.addChild(_tradeGiveCardContainer);
    _tradeRecvStage.addChild(_tradeRecvCardContainer);

    // Create stage for resource cards
    _cardStage = new createjs.Stage("cardCanvas");
    _cardContainer = new createjs.Container();
    _cardStage.addChild(_cardContainer);

    // Init the main stage.
    _stage = new createjs.Stage("gameCanvas");
    _boardContainer = new createjs.Container();
    _boardContainer.visible = false; // The board will be invisible until we get the game manager model.

    // draw water
    _water = new createjs.Bitmap(_assetMap["imgWater"].data);
    _water.mouseEnabled = false;
    _stage.addChild(_water);

    // create theif
    var robberAsset = _assetMap["imgThief"];
    _boardRobber = new createjs.Bitmap(robberAsset.data);
    _boardRobber.mouseEnabled = false;
    _boardRobber.regX = robberAsset.hitbox.centerX;
    _boardRobber.regY = robberAsset.hitbox.centerY;
    // theif for when it's being moved
    _boardRobberMoving = new createjs.Bitmap(robberAsset.data);
    _boardRobberMoving.mouseEnabled = false;
    _boardRobberMoving.regX = robberAsset.hitbox.centerX;
    _boardRobberMoving.regY = robberAsset.hitbox.centerY;
    _boardRobberMoving.alpha = 0.75;
    _boardRobberMoving.visible = false;

    // Create multiple containers so we can layer the images properly
    _boardTileContainer = new createjs.Container();
    _boardRoadContainer = new createjs.Container();
    _boardBuildingContainer = new createjs.Container();
    _boardSelectItemsContainer = new createjs.Container();
    _boardLabelContainer = new createjs.Container();

    // Containers with nothing selectable should disalbe mouse interactions for all children.
    _boardRoadContainer.mouseChildren = false;
    _boardBuildingContainer.mouseChildren = false;
    _boardLabelContainer.mouseChildren = false;

    _boardContainer.addChild(_boardTileContainer);
    _boardContainer.addChild(_boardRoadContainer);
    _boardContainer.addChild(_boardSelectItemsContainer);
    _boardContainer.addChild(_boardBuildingContainer);
    _boardContainer.addChild(_boardRobber);
    _boardContainer.addChild(_boardRobberMoving);
    _boardContainer.addChild(_boardLabelContainer);
    _stage.addChild(_boardContainer);

    // add container for toast messages
    _toastMessageContainer = new createjs.Container();
    _toastMessageContainer.mouseChildren = false;
    _stage.addChild(_toastMessageContainer);

    // draw hexagons
    var beachAsset = _assetMap["imgTileBeach"];
    var beachWidth = beachAsset.hitbox.width;
    var beachHeight = beachAsset.hitbox.height;
    // save the sprites in a list so we can add them to the container in the correct order.
    var beachBitmaps = [];
    var beachShadows = [];
    var roads = [];
    var hexIndex = 0;
    for (var row = 0; row < 5; row++) {
        var shiftX = 0;
        var numAcross = 5;
        if (row === 0 || row === 4) { shiftX = beachWidth; numAcross = 3; }
        if (row === 1 || row === 3) { shiftX = beachWidth / 2; numAcross = 4; }
        for (var col = 0; col < numAcross; col++) {
            var hexKey = _hexKeys[hexIndex++];
            var beach = new createjs.Bitmap(beachAsset.data);
            beach.mouseEnabled = true;
            beach.regX = beachAsset.hitbox.centerX;
            beach.regY = beachAsset.hitbox.centerY;
            beach.x = (beachWidth / 2) + col * beachWidth + shiftX;
            beach.y = (beachHeight / 2) + row * (beachHeight * 0.75);
            _hexToBeachMap[hexKey] = beach;

            // create drop shadow
            var beachShadow = new createjs.Bitmap(_assetMap["imgTileBeachShadow"].data);
            beachShadow.mouseEnabled = false;
            beachShadow.regX = _assetMap["imgTileBeachShadow"].hitbox.centerX;
            beachShadow.regY = _assetMap["imgTileBeachShadow"].hitbox.centerY;
            beachShadow.x = beach.x;
            beachShadow.y = beach.y;

            beachShadows.push(beachShadow);
            beachBitmaps.push(beach);
        }
    }

    // Tiles need to be drawn on top of shadows, so they get added after.
    for (var i = 0; i < beachShadows.length; i++) {
        _boardTileContainer.addChild(beachShadows[i]);
    }
    for (var i = 0; i < beachBitmaps.length; i++) {
        _boardTileContainer.addChild(beachBitmaps[i]);
    }

    _boardContainer.regX = _boardContainer.getBounds().width / 2;
    _boardContainer.regY = _boardContainer.getBounds().height / 2;
    _boardContainer.scaleX = 0.65;
    _boardContainer.scaleY = 0.65;

    // allow user to move and scale the board with the mouse
    initMouseWheelScaling();

    checkRender(); // start animation loop
}

function checkRender() {
    if (resizeCanvas()) {
        _invalidateCanvas = true;
        centerBoardInCanvas();
        resizeWaterBackground();
        centerInCanvas(_toastMessageContainer);
    }
    if (_invalidateCanvas) {
        _invalidateCanvas = false;
        _stage.update();
    }
    if (_invalidateCardCanvas) {
        _invalidateCardCanvas = false;
        _cardStage.update();
    }
    if (_invalidateTradeGiveCanvas) {
        _invalidateTradeGiveCanvas = false;
        _tradeGiveStage.update();
    }
    if (_invalidateTradeRecvCanvas) {
        _invalidateTradeRecvCanvas = false;
        _tradeRecvStage.update();
    }
    requestAnimationFrame(checkRender);
}

function resizeCanvas() {
    var cw = _canvas.clientWidth;
    var ch = _canvas.clientHeight;
    if (_canvas.width !== cw || _canvas.height !== ch) {
        _canvas.width = cw;
        _canvas.height = ch;
        return true;
    }
    return false;
}

function resizeWaterBackground() {
    var scaleX = 1;
    var scaleY = 1;
    if (_water.image.width < _canvas.width) {
        scaleX = _canvas.width / _water.image.width;
    }
    if (_water.image.height < _canvas.height) {
        scaleY = _canvas.height / _water.image.height;
    }
    if (scaleX > scaleY) {
        _water.scaleX = scaleX;
        _water.scaleY = scaleX;
    } else {
        _water.scaleX = scaleY;
        _water.scaleY = scaleY;
    }
}

function centerBoardInCanvas() {
    // TODO: This should use offsets
    _boardContainer.x = _canvas.width / 2;
    _boardContainer.y = _canvas.height / 2;
}

function centerInCanvas(container) {
    if (container != null) {
        container.x = _canvas.width / 2;
        container.y = _canvas.height / 2;
    }
}

function initMouseWheelScaling() {
    var maxScale = 1.0;
    var minScale = 0.4;
    var scaleStep = 0.02;
    $("#gameCanvas").bind("mousewheel DOMMouseScroll", function (event) {
        if (event.originalEvent.wheelDelta > 0 || event.originalEvent.detail < 0) {
            // scroll up
            if (_boardContainer.scaleX < maxScale) {
                if (_boardContainer.scaleX >= (maxScale - scaleStep)) {
                    _boardContainer.scaleX = maxScale;
                    _boardContainer.scaleY = maxScale;
                } else {
                    _boardContainer.scaleX += scaleStep;
                    _boardContainer.scaleY += scaleStep;
                }
                _invalidateCanvas = true;
            }
        }
        else {
            // scroll down
            if (_boardContainer.scaleX > minScale) {
                if (_boardContainer.scaleX <= (minScale + scaleStep)) {
                    _boardContainer.scaleX = minScale;
                    _boardContainer.scaleY = minScale;
                } else {
                    _boardContainer.scaleX -= scaleStep;
                    _boardContainer.scaleY -= scaleStep;
                }
                _invalidateCanvas = true;
            }
        }
    });
    // make grame board draggable
    _boardContainer.on("mousedown", function (event) {
        // save active mouse button because pressmove event does not contain button data
        _activeMouseButton = event.nativeEvent.button;
    });
    _boardContainer.on("pressmove", function (event) {
        // Right-click only
        if (_activeMouseButton !== 2)
            return;
        // save offset so we can drag any part of the board.
        if (_boardDragMouseOffsetX === null) {
            _boardDragMouseOffsetX = _boardContainer.x - event.stageX;
            _boardDragMouseOffsetY = _boardContainer.y - event.stageY;
        }
        _boardContainer.x = event.stageX + _boardDragMouseOffsetX;
        _boardContainer.y = event.stageY + _boardDragMouseOffsetY;

        // Don't let the board leave the canvas.
        if (_boardContainer.x > _canvas.width) _boardContainer.x = _canvas.width;
        else if (_boardContainer.x < 0) _boardContainer.x = 0;
        if (_boardContainer.y > _canvas.height) _boardContainer.y = _canvas.height;
        else if (_boardContainer.y < 0) _boardContainer.y = 0;

        _invalidateCanvas = true;
    });
    _boardContainer.on("pressup", function (event) {
        _boardDragMouseOffsetX = null;
        _boardDragMouseOffsetY = null;
    });
}

function writeTextToChat(text, chatTextType) {
    var textClass = "";
    if (chatTextType) {
        textClass = chatTextType;
    }
    $("#chatMessagesList").append("<li class='" + textClass + "'>" + encodeForHtml(text) + "</li>");
    $("#chatMessagesList").animate({ scrollTop: $("#chatMessagesList")[0].scrollHeight }, 10);
}


//===============================
// Board update from model
//===============================

function updateGameModel(gameManager) {
    _currentGameManager = gameManager;
    var board = gameManager["GameBoard"];

    // board properties
    var resourceTiles = board["ResourceTiles"];
    var ports = board["Ports"];
    var roads = board["Roads"];
    var buildings = board["Buildings"];
    var robberLocation = board["RobberLocation"];
    var robberMode = board["RobberMode"];

    // state properties
    var myPlayerId = gameManager["MyPlayerId"];
    var player = getPlayerFromId(myPlayerId);
    var gameState = gameManager["GameState"];
    var playerTurnState = gameManager["PlayerTurnState"];
    var activePlayerId = gameManager["ActivePlayerId"];
    var currentDiceRoll = gameManager["CurrentDiceRoll"];
    var players = gameManager["Players"];
    var cardsToLose = player["CardsToLose"];

    // valid placement lists are only populated if needed.
    var validRoadPlacements = gameManager["ValidRoadPlacements"];
    var validSettlementPlacements = gameManager["ValidSettlementPlacements"];
    var validCityPlacements = gameManager["ValidCityPlacements"];

    if (resourceTiles != null && getDictLength(resourceTiles) > 0) {
        _currentResourceTiles = resourceTiles;
        // if we haven't populated the resource tiles on the board yet, do it.
        if (!_resourceTilesPopulated)
            populateResourceTiles();
    }
    if (ports != null && getDictLength(ports) > 0) {
        _currentPorts = ports;
        if (!_portsPopulated)
            populatePorts();
    }

    populateDice();
    populateTurnInfoBox();
    populateResourceCards();
    populatePlayers();
    populateBuildings();
    populateRoads();
    populateRobber();
    populateSelectItems();
    setResourceTileSelectionMode();
    setGlowForDiceRoll();
    populateBuyButtons();

    // By default, don't generate stage mouseover events. They are expensive.
    var enableMouseOverEvents = false;

    // TODO ...
    if (myPlayerId === activePlayerId) { // We are currently the active player.
        switch (playerTurnState) { // TODO: Change board actions based on turn state.
            case PlayerTurnState.None:
                break;
            case PlayerTurnState.TakeAction:
                break;
            case PlayerTurnState.NeedToRoll:
                break;
            case PlayerTurnState.PlacingSettlement:
                enableMouseOverEvents = true;
                break;
            case PlayerTurnState.PlacingCity:
                enableMouseOverEvents = true;
                break;
            case PlayerTurnState.PlacingRoad:
                enableMouseOverEvents = true;
                break;
            case PlayerTurnState.PlacingRobber:
                enableMouseOverEvents = true;
                break;
            case PlayerTurnState.SelectingPlayerToStealFrom:
                break;
            case PlayerTurnState.AnyPlayerSelectingCardsToLose:
                if (cardsToLose > 0) {
                    displayToastMessage("A 7 was rolled! Select " + cardsToLose.toString() + " resource cards to discard.", null);
                }
                break;
            case PlayerTurnState.RequestingPlayerTrade:
                break;
            case PlayerTurnState.MonopolySelectingResource:
                break;
            case PlayerTurnState.RoadBuildingSelectingRoads:
                enableMouseOverEvents = true;
                break;
            case PlayerTurnState.YearOfPlentySelectingResources:
                break;
            default:
                break;
        }
    } else { // We are waiting for another player to finish their turn.
        switch (playerTurnState) {
            case PlayerTurnState.RequestingPlayerTrade:
                // TODO: Allow sending a counter offer
                break;
            case PlayerTurnState.AnyPlayerSelectingCardsToLose:
                if (cardsToLose > 0) {
                    displayToastMessage("A 7 was rolled! Select " + cardsToLose.toString() + " resource cards to discard.", null);
                }
                break;
            default:
                break;
        }
    }

    if (enableMouseOverEvents) {
        _stage.enableMouseOver(20);
    } else {
        _stage.enableMouseOver(0);
    }

    // If the game has started, make the board visible.
    _boardContainer.visible = (gameState !== GameState.NotStarted);

    // Draw when everything has been populated
    _invalidateCanvas = true;
}

function populateResourceTiles() {

    // If we're here, then we should have a game manager instance from the server.
    if (_currentGameManager == null || _currentResourceTiles == null) {
        return;
    }

    _numberTileMap = {};
    var resTiles = [];
    var tileIndex = 0;
    for (var row = 0; row < 5; row++) {
        var numAcross = 5;
        if (row === 0 || row === 4) { numAcross = 3; }
        if (row === 1 || row === 3) { numAcross = 4; }
        for (var col = 0; col < numAcross; col++) {

            var hexKey = _hexKeys[tileIndex++];
            var beach = _hexToBeachMap[hexKey];

            var resource = _currentResourceTiles[hexKey]["Resource"];
            var srcKey = _resourceToAssetKeys[resource];
            var tile = new createjs.Bitmap(_assetMap[srcKey].data);
            tile.regX = _assetMap[srcKey].hitbox.centerX;
            tile.regY = _assetMap[srcKey].hitbox.centerY;
            tile.x = beach.x; // center on beach tile
            tile.y = beach.y; // center on beach tile

            tile.mouseEnabled = false; // Only set mouse enabled when placing the robber.
            tile.addEventListener("click", handleResTileClick);
            tile.addEventListener("mouseover", handleResTileMouseOver);
            tile.addEventListener("mouseout", handleResTileMouseOut);

            resTiles.push(tile);

            // save the bitmap to the hexmap so we can get which hex it refers to.
            _hexToResourceTileMap[hexKey] = tile;

            // Create number tile which shows the roll needed to active this resource.
            if (resource === ResourceTypes.None) continue; // No need to draw a number on the desert tile.

            var numberTileContainer = new createjs.Container();
            numberTileContainer.mouseChildren = false;
            numberTileContainer.mouseEnabled = false;

            var graphics = new createjs.Graphics();
            var circleRadius = 30;
            graphics.setStrokeStyle(1);
            graphics.beginStroke("#000000");
            graphics.beginFill("#ffffff");
            graphics.drawCircle(0, 0, circleRadius);
            var shape = new createjs.Shape(graphics);
            shape.name = "circle";
            shape.mouseEnabled = false;
            shape.alpha = 0.65;
            shape.x = 0;
            shape.y = 0;
            numberTileContainer.addChild(shape);

            var number = _currentResourceTiles[hexKey]["RetrieveNumber"];
            var dots = getProbabilityFromRoll(number);
            var dotColor = (dots === 5) ? "#ff0000" : "#000000";
            var dotRadius = circleRadius / 12;
            var spanWidth = (2 * dotRadius * dots) + (dots - 1) * dotRadius;
            var posX = (-spanWidth / 2) + dotRadius;
            for (var i = 0; i < dots; i++) {

                var dotG = new createjs.Graphics().beginFill(dotColor).drawCircle(0, 0, dotRadius);
                var dotShape = new createjs.Shape(dotG);
                dotShape.mouseEnabled = false;
                dotShape.x = shape.x + posX;
                dotShape.y = shape.y + (circleRadius / 2);
                posX += (3 * dotRadius);
                numberTileContainer.addChild(dotShape);
            }

            var text = new createjs.Text(number.toString(), "bold 28px Serif", dotColor);
            text.mouseEnabled = false;
            var tr = text.getBounds();
            if (tr != null) {
                text.regX = tr.width / 2;
                text.regY = tr.height / 2;
            }
            text.x = shape.x;
            text.y = shape.y - (circleRadius / 8);
            numberTileContainer.addChild(text);

            numberTileContainer.x = beach.x;
            numberTileContainer.y = beach.y + 30;

            // Save a map so we can quickly lookup a number tile from a roll number.
            if (_numberTileMap[number] == null)
                _numberTileMap[number] = [];
            _numberTileMap[number].push(numberTileContainer);

            _boardLabelContainer.addChild(numberTileContainer);
        }
    }
    for (var i = 0; i < resTiles.length; i++) {
        _boardTileContainer.addChild(resTiles[i]);
    }

    _resourceTilesPopulated = true;
    _invalidateCanvas = true;
}

function setResourceTileSelectionMode() {
    if (_currentGameManager == null || _currentResourceTiles == null) {
        return;
    }
    var hexKeys = Object.keys(_hexToResourceTileMap);
    for (var i = 0; i < hexKeys.length; i++) {
        var hexKey = hexKeys[i];
        var resTileBmp = _hexToResourceTileMap[hexKey];
        if (_currentGameManager["PlayerTurnState"] === PlayerTurnState.PlacingRobber) {
            resTileBmp.mouseEnabled = true;

        } else {
            resTileBmp.mouseEnabled = false;
        }
    }
}

function setGlowForDiceRoll() {
    // Make the tiles that generated resources glow.
    if (_currentGameManager == null || _currentResourceTiles == null)
        return;

    var playerState = _currentGameManager["PlayerTurnState"];
    var diceRoll = _currentGameManager["CurrentDiceRoll"];

    if (playerState === PlayerTurnState.None ||
        playerState === PlayerTurnState.NeedToRoll ||
        diceRoll == null) {

        // Remove the tile glows.
        var hexKeys = Object.keys(_hexToResourceTileMap);
        for (var i = 0; i < hexKeys.length; i++) {
            var bitmap = _hexToResourceTileMap[hexKeys[i]];
            bitmap.shadow = null;
        }
        setNumberTileGlow(false, 0);

        return;
    }

    var rollTotal = diceRoll["Total"];
    var hexKeys = Object.keys(_currentResourceTiles);
    for (var i = 0; i < hexKeys.length; i++) {
        var hex = hexKeys[i];
        var resourceTile = _currentResourceTiles[hex];
        var bitmap = _hexToResourceTileMap[hex];
        var tileNumber = resourceTile["RetrieveNumber"];
        if (tileNumber === rollTotal) {
            // This tile generated resources.
            bitmap.shadow = new createjs.Shadow("#fff", 0, 0, 10);
        } else {
            bitmap.shadow = null;
        }
    }
    setNumberTileGlow(true, rollTotal);
}

function setNumberTileGlow(glow, number) {
    for (var i = 2; i <= 12; i++) {
        if (_numberTileMap[i] == null) continue;

        for (var j = 0; j < _numberTileMap[i].length; j++) {
            var container = _numberTileMap[i][j];
            if (glow) {
                if (number === i) {
                    container.shadow = new createjs.Shadow("#fff", 0, 0, 20);
                    container.scaleX = 1.2;
                    container.scaleY = 1.2;
                    var circle = container.getChildByName("circle");
                    circle.alpha = 1.0;
                }
            } else {
                container.shadow = null;
                container.scaleX = 1.0;
                container.scaleY = 1.0;
                var circle = container.getChildByName("circle");
                circle.alpha = 0.65;
            }
        }

    }
}

function handleResTileMouseOver(event) {
    var obj = event.target;
    obj.filters = [new createjs.ColorFilter(1.2, 1.2, 1.2, 1, 0, 0, 0, 0)];
    obj.cache(-500, -500, 1000, 1000);

    _boardRobberMoving.visible = true;
    _boardRobberMoving.x = obj.x;
    _boardRobberMoving.y = obj.y;

    _invalidateCanvas = true;
}
function handleResTileMouseOut(event) {
    var obj = event.target;
    obj.filters = [];
    obj.updateCache();

    _boardRobberMoving.visible = false;

    _invalidateCanvas = true;
}
function handleResTileClick(event) {
    if (event.nativeEvent.button !== 0)
        return;
    var obj = event.target;
    obj.filters = [];
    obj.updateCache();
    _invalidateCanvas = true;

    var hex = getHexFromResourceTileBitmap(obj);
    if (hex == null || _serverGameHub == null)
        return;

    _boardRobberMoving.visible = false;

    _serverGameHub.selectTileForRobber(hex).done(function (result) {
        if (!result["Succeeded"]) { // failed. display error message.
            displayToastMessage(result["Message"]);
        }
    });
}

function populatePorts() {
    // If we're here, then we should have a game manager instance from the server.
    if (_currentGameManager == null || _currentResourceTiles == null) {
        return;
    }

    var boatAsset = _assetMap["imgBoat"];
    var dockForwardAsset = _assetMap["imgDock1"];
    var dockBackwardAsset = _assetMap["imgDock2"];
    var dfw = dockForwardAsset.hitbox.width;
    var dfh = dockForwardAsset.hitbox.height;
    var dbw = dockBackwardAsset.hitbox.width;
    var dbh = dockBackwardAsset.hitbox.height;

    var beachAsset = _assetMap["imgTileBeach"];
    var bw = beachAsset.hitbox.width;
    var bh = beachAsset.hitbox.height;

    var hexEdges = Object.keys(_currentPorts);
    for (var i = 0; i < hexEdges.length; i++) {
        var hexEdge = hexEdges[i];
        var port = _currentPorts[hexEdge];
        var resource = port["Resource"];
        var tmp = gethexAndDirectionFromEdge(hexEdge);
        var hex = tmp[0];
        var dir = tmp[1];
        var hexValues = hexToValueArray(hex);

        var tile = _hexToResourceTileMap[hex];
        var beach = _hexToBeachMap[hex];
        var forwardDock = false;

        // Determine how the dock should be angled
        if (dir === EdgeDir.TopLeft || dir === EdgeDir.BottomRight) {
            forwardDock = false;
        }
        else if (dir === EdgeDir.TopRight || dir === EdgeDir.BottomLeft) {
            forwardDock = true;
        }
        else if (dir === EdgeDir.Left) {
            if (hexValues[1] <= 0) { // bottom half
                forwardDock = true;
            } else {// top half
                forwardDock = false;
            }
        }
        else if (dir === EdgeDir.Right) {
            if (hexValues[1] <= 0) { // bottom half
                forwardDock = false;
            } else { // top half
                forwardDock = true;
            }
        } else {
            forwardDock = true;
        }

        var dockAsset = forwardDock ? dockForwardAsset : dockBackwardAsset;
        var dw = forwardDock ? dfw : dbw;
        var dh = forwardDock ? dfh : dbh;

        var boat = new createjs.Bitmap(boatAsset.data);
        var dock1 = new createjs.Bitmap(dockAsset.data);
        var dock2 = new createjs.Bitmap(dockAsset.data);
        boat.mouseEnabled = false;
        dock1.mouseEnabled = false;
        dock2.mouseEnabled = false;
        boat.regX = boatAsset.hitbox.centerX;
        boat.regY = boatAsset.hitbox.centerY;
        dock1.regX = dockAsset.hitbox.centerX;
        dock1.regY = dockAsset.hitbox.centerY;
        dock2.regX = dockAsset.hitbox.centerX;
        dock2.regY = dockAsset.hitbox.centerY;

        if (dir === EdgeDir.Right) {
            dock1.x = beach.x + (bw / 2 + dw / 4 + 10);
            dock1.y = beach.y + (bh / 6 - dh / 4);
            dock2.x = beach.x + (bw / 2 + dw / 4 + 10);
            dock2.y = beach.y - (bh / 6 + dh / 2);
            if (!forwardDock) {
                dock1.y += bh / 6;
                dock2.y += bh / 6;
            }
            boat.x = beach.x + bw;
            boat.y = beach.y;
            boat.y += (forwardDock ? -0.5 : 0.5) * boatAsset.hitbox.height;
        }
        else if (dir === EdgeDir.Left) {
            dock1.x = beach.x - (bw / 2 + dw / 4 + 10);
            dock1.y = beach.y + (bh / 6 - dh / 4);
            dock2.x = beach.x - (bw / 2 + dw / 4 + 10);
            dock2.y = beach.y - (bh / 6 + dh / 2);
            if (forwardDock) {
                dock1.y += bh / 6;
                dock2.y += bh / 6;
            }
            boat.x = beach.x - bw;
            boat.y = beach.y;
            boat.y += (forwardDock ? 0.5 : -0.5) * boatAsset.hitbox.height;
        }
        else if (dir === EdgeDir.BottomRight) {
            dock1.x = beach.x + dw / 2 - 10;
            dock1.y = beach.y + bh / 2 + dh / 6;
            dock2.x = beach.x + bw / 2 + dw / 4;
            dock2.y = beach.y + bh / 6 + dw / 4;

            boat.x = beach.x + (2 * bw) / 3;
            boat.y = beach.y + (2 * bh) / 3;
        }
        else if (dir === EdgeDir.TopLeft) {
            dock1.x = beach.x - (dw / 2 - 10);
            dock1.y = beach.y - (bh / 2 + dh / 6);
            dock2.x = beach.x - (bw / 2 + dw / 4);
            dock2.y = beach.y - (bh / 6 + dw / 4);

            boat.x = beach.x - (2 * bw) / 3;
            boat.y = beach.y - (2 * bh) / 3;
        }
        else if (dir === EdgeDir.TopRight) {
            dock1.x = beach.x + (dw / 2 - 10);
            dock1.y = beach.y - (bh / 2 + dh / 6);
            dock2.x = beach.x + (bw / 2 + dw / 4);
            dock2.y = beach.y - (bh / 6 + dw / 4);

            boat.x = beach.x + (2 * bw) / 3;
            boat.y = beach.y - (2 * bh) / 3;
        }
        else if (dir === EdgeDir.BottomLeft) {
            dock1.x = beach.x - (dw / 2 - 10);
            dock1.y = beach.y + bh / 2 + dh / 6;
            dock2.x = beach.x - (bw / 2 + dw / 4);
            dock2.y = beach.y + bh / 6 + dw / 4;

            boat.x = beach.x - (2 * bw) / 3;
            boat.y = beach.y + (2 * bh) / 3;
        }

        // Create resource type and ratio label
        var strRatio = (resource === ResourceTypes.None) ? "3:1" : "2:1";

        var graphics = new createjs.Graphics();
        var boxWidth = 100;
        var boxHeight = 65;
        graphics.setStrokeStyle(1).beginStroke("#000000").beginFill("#dddddd").drawRect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight);
        var boxShape = new createjs.Shape(graphics);
        boxShape.mouseEnabled = false;
        boxShape.x = boat.x;
        boxShape.y = boat.y;
        boxShape.alpha = 0.75;
        var ratioText = new createjs.Text(strRatio, "bold 24px Serif", "#000000");
        ratioText.mouseEnabled = false;
        var tr = ratioText.getBounds();
        if (tr != null) {
            ratioText.regX = tr.width / 2;
            ratioText.regY = tr.height / 2;
        }
        ratioText.x = boxShape.x;
        ratioText.y = boxShape.y - boxHeight / 4;

        var strResource = (resource === ResourceTypes.Brick) ? "Brick"
            : (resource === ResourceTypes.Ore) ? "Ore"
            : (resource === ResourceTypes.Sheep) ? "Sheep"
            : (resource === ResourceTypes.Wheat) ? "Wheat"
            : (resource === ResourceTypes.Wood) ? "Wood"
            : (resource === ResourceTypes.None) ? "Question" : "";

        if (strResource === "")
            continue;

        // show an icon for the resource
        var iconAsset = _assetMap["imgIcon" + strResource];
        var resIcon = new createjs.Bitmap(iconAsset.data);
        resIcon.mouseEnabled = false;
        resIcon.regX = iconAsset.hitbox.centerX;
        resIcon.regY = iconAsset.hitbox.centerY;
        resIcon.x = boxShape.x;
        resIcon.y = boxShape.y + boxHeight / 4;
        if (resource !== ResourceTypes.None) {
            // The resource icons are a little small. Scale up a bit.
            resIcon.scaleX = 1.3;
            resIcon.scaleY = 1.3;
        }

        _boardTileContainer.addChild(dock1);
        _boardTileContainer.addChild(dock2);
        _boardTileContainer.addChild(boat);

        _boardTileContainer.addChild(boxShape);
        _boardTileContainer.addChild(ratioText);
        _boardTileContainer.addChild(resIcon);
    }

    _portsPopulated = true;
    _invalidateCanvas = true;
}

function populateBuildings() {
    if (_currentGameManager == null)
        return;

    // Clear the current buildings
    _boardBuildingContainer.removeAllChildren();

    var board = _currentGameManager["GameBoard"];
    var buildings = board["Buildings"];

    var pointKeys = Object.keys(buildings);
    for (var i = 0; i < pointKeys.length; i++) {
        var hexPoint = pointKeys[i];
        var building = buildings[hexPoint];
        var type = building["Type"];
        var playerId = building["PlayerId"];

        var bitmap = createBuildingBitmap(hexPoint, type, playerId);
        bitmap.mouseEnabled = false;

        _boardBuildingContainer.addChild(bitmap);
    }
}

function createBuildingBitmap(hexPoint, buildingType, playerId) {
    var assetPrefix = (buildingType === BuildingTypes.City) ? "imgCity" : ("imgHouse" + hexPointToHouseType(hexPoint).toString());
    var assetKey = assetPrefix;
    if (playerId != null) {
        var player = getPlayerFromId(playerId);
        var color = player["Color"];
        assetKey = getAssetKeyFromColor(assetPrefix, player["Color"]);
    }
    var asset = _assetMap[assetKey];
    var stageLoc = hexPointToCoordinates(hexPoint);
    var bitmap = new createjs.Bitmap(asset.data);
    bitmap.regX = asset.hitbox.centerX;
    bitmap.regY = asset.hitbox.centerY;
    bitmap.x = stageLoc[0];
    bitmap.y = stageLoc[1];
    return bitmap;
}

function hexPointToHouseType(hexPoint) {
    // This function generates a specific house type of a hex point.
    var total = 0;
    for (var i = 0; i < hexPoint.length; i++) {
        total += hexPoint[i].charCodeAt(0);
    }
    total %= 3;
    return total + 1;
}

function populateRoads() {
    if (_currentGameManager == null)
        return;

    // Clear the current roads
    _boardRoadContainer.removeAllChildren();

    var board = _currentGameManager["GameBoard"];
    var roads = board["Roads"];

    var roadEdgeKeys = Object.keys(roads);
    for (var i = 0; i < roadEdgeKeys.length; i++) {
        var hexEdge = roadEdgeKeys[i];
        var road = roads[hexEdge];
        var playerId = road["PlayerId"];

        var bitmap = createRoadBitmap(hexEdge, playerId);
        if (bitmap == null) continue;
        bitmap.mouseEnabled = false;

        _boardRoadContainer.addChild(bitmap);
    }
}

function createRoadBitmap(hexEdge, playerId) {
    var tmp = gethexAndDirectionFromEdge(hexEdge);
    var hex = tmp[0];
    var direction = tmp[1];
    var roadType = null;
    switch (direction) {
        case EdgeDir.BottomLeft:
        case EdgeDir.TopRight:
            roadType = "1";
            break;
        case EdgeDir.Left:
        case EdgeDir.Right:
            roadType = "2";
            break;
        case EdgeDir.TopLeft:
        case EdgeDir.BottomRight:
            roadType = "3";
            break;
    }
    if (roadType == null) return null;

    var roadAssetKey = "";
    if (playerId != null) {
        var player = getPlayerFromId(playerId);
        var color = player["Color"];
        roadAssetKey = getAssetKeyFromColor("imgRoad" + roadType, player["Color"]);
    } else {
        roadAssetKey = "imgRoad" + roadType;
    }

    var asset = _assetMap[roadAssetKey];
    var bitmap = new createjs.Bitmap(asset.data);
    bitmap.regX = asset.hitbox.centerX;
    bitmap.regY = asset.hitbox.centerY;

    // get beach tile position
    var beachAsset = _assetMap["imgTileBeach"];
    var beach = _hexToBeachMap[hex];
    var beachWidth = beachAsset.hitbox.width;
    var beachHeight = beachAsset.hitbox.height;

    if (direction === EdgeDir.Left) {
        bitmap.x = beach.x - beachWidth * 0.5;
        bitmap.y = beach.y;
    }
    else if (direction === EdgeDir.TopLeft) {
        bitmap.x = beach.x - beachWidth * 0.25;
        bitmap.y = beach.y - beachHeight * 0.39;
    }
    else if (direction === EdgeDir.TopRight) {
        bitmap.x = beach.x + beachWidth * 0.25;
        bitmap.y = beach.y - beachHeight * 0.39;
    }
    else if (direction === EdgeDir.Right) {
        bitmap.x = beach.x + beachWidth * 0.5;
        bitmap.y = beach.y;
    }
    else if (direction === EdgeDir.BottomRight) {
        bitmap.x = beach.x + beachWidth * 0.25;
        bitmap.y = beach.y + beachHeight * 0.39;
    }
    else if (direction === EdgeDir.BottomLeft) {
        bitmap.x = beach.x - beachWidth * 0.25;
        bitmap.y = beach.y + beachHeight * 0.39;
    }

    return bitmap;
}

function populateDice() {
    if (_currentGameManager == null)
        return;

    var playerState = _currentGameManager["PlayerTurnState"];
    var diceRoll = _currentGameManager["CurrentDiceRoll"];
    var $diceInfoBox = $("#diceInfoBox");

    if (playerState === PlayerTurnState.None ||
        playerState === PlayerTurnState.NeedToRoll ||
        diceRoll == null) {
        // hide the dice info box.
        $diceInfoBox.removeClass("dice-box-show");
    }
    else {
        var total = diceRoll["Total"];
        if (total != null) {
            $("#diceText").text(total.toString());
        } else {
            $("#diceText").text("");
        }

        // Set dice images
        var diceArray = diceRoll["Dice"];
        if (diceArray != null && diceArray.length >= 2) {
            var diceValue1 = diceArray[0];
            var diceValue2 = diceArray[1];
            var diceAsset1 = _assetMap["imgDice" + diceValue1.toString()];
            var diceAsset2 = _assetMap["imgDice" + diceValue2.toString()];
            $("#diceImage1").attr("src", diceAsset1.src);
            $("#diceImage2").attr("src", diceAsset2.src);
        }
        else {
            $("#diceImage1").attr("src", "");
            $("#diceImage2").attr("src", "");
        }

        // show the dice info box.
        $diceInfoBox.addClass("dice-box-show");
    }
}

function populateTurnInfoBox() {
    if (_currentGameManager == null)
        return;

    var players = _currentGameManager["Players"];
    var activePlayerId = _currentGameManager["ActivePlayerId"];
    var gameState = _currentGameManager["GameState"];
    var playerTurnState = _currentGameManager["PlayerTurnState"];
    var gameStarted = (gameState === GameState.InitialPlacement || gameState === GameState.GameInProgress);

    $("#turnInfoBox").removeClass("hidden");
    var activePlayer = getPlayerFromId(activePlayerId);
    $("#userInfoTextactiveUser").removeClass("text-color-blue");
    $("#userInfoTextactiveUser").removeClass("text-color-red");
    $("#userInfoTextactiveUser").removeClass("text-color-green");
    $("#userInfoTextactiveUser").removeClass("text-color-yellow");
    if (gameStarted && activePlayer != null) {
        $("#userInfoTextactiveUser").text(activePlayer["Name"]);
        var activeColorClass = "";
        var activePlayerColor = activePlayer["Color"];
        if (activePlayerColor === PlayerColor.Blue) activeColorClass = "text-color-blue";
        else if (activePlayerColor === PlayerColor.Red) activeColorClass = "text-color-red";
        else if (activePlayerColor === PlayerColor.Green) activeColorClass = "text-color-green";
        else if (activePlayerColor === PlayerColor.Yellow) activeColorClass = "text-color-yellow";
        $("#userInfoTextactiveUser").addClass(activeColorClass);
        $("#userInfoTextSpan").text("'s turn");

        var turnInfoText = PlayerTurnStateText[playerTurnState]; // get info text for the current turn state.
        $("#turnInfoText").text(turnInfoText);
    }
    else if (gameState === GameState.NotStarted) {
        $("#userInfoTextactiveUser").text("");
        $("#userInfoTextSpan").text("Waiting for players to join...");
        if (players.length >= 2) {
            $("#turnInfoText").text("The host can now start the game.");
        } else {
            $("#turnInfoText").text("");
        }
    }
    else if (gameState === GameState.EndOfGame) {
        $("#userInfoTextactiveUser").text("");
        $("#userInfoTextSpan").text("The game is over!");
        $("#turnInfoText").text("");
    } else {
        $("#turnInfoBox").addClass("hidden");
    }
}

function populatePlayers() {
    if (_currentGameManager == null)
        return;

    var players = _currentGameManager["Players"];
    var activePlayerId = _currentGameManager["ActivePlayerId"];
    var gameState = _currentGameManager["GameState"];
    var gameStarted = (gameState === GameState.InitialPlacement || gameState === GameState.GameInProgress);

    for (var i = 0; i < 4; i++) {
        var boxId = "#playerBox" + (i + 1).toString();
        if (players.length > i) {
            var player = players[i];
            var playerId = player["Id"];
            var playerName = player["Name"];
            var avatarPath = player["AvatarPath"];

            $(boxId).removeClass("hidden");
            $(boxId + " > .player-name").text(playerName);
            if (avatarPath) {
                $(boxId + " > .player-avatar").attr("src", avatarPath);
            }

            $(boxId).removeClass("active-player");
            if (gameStarted && playerId === activePlayerId) {
                $(boxId).addClass("active-player");
            }

            $(boxId).removeClass("player-color-blue");
            $(boxId).removeClass("player-color-red");
            $(boxId).removeClass("player-color-green");
            $(boxId).removeClass("player-color-yellow");
            var color = player["Color"];
            var colorClass = "";
            if (color === PlayerColor.Blue) colorClass = "player-color-blue";
            else if (color === PlayerColor.Red) colorClass = "player-color-red";
            else if (color === PlayerColor.Green) colorClass = "player-color-green";
            else if (color === PlayerColor.Yellow) colorClass = "player-color-yellow";
            $(boxId).addClass(colorClass);
        }
        else {
            $(boxId).addClass("hidden");
        }
    }
}

function populateRobber() {
    if (_currentGameManager == null)
        return;

    var robberLocation = _currentGameManager["GameBoard"]["RobberLocation"];
    var beach = _hexToBeachMap[robberLocation];
    _boardRobber.x = beach.x; // center on beach tile
    _boardRobber.y = beach.y; // center on beach tile

    _boardRobberMoving.visible = false;
}

function populateSelectItems() {
    if (_currentGameManager == null)
        return;

    var playerId = _currentGameManager["MyPlayerId"];
    var players = _currentGameManager["Players"];
    var activePlayerId = _currentGameManager["ActivePlayerId"];
    var playerTurnState = _currentGameManager["PlayerTurnState"];

    // Make player boxes selectable if needed.
    if (activePlayerId === playerId && playerTurnState === PlayerTurnState.SelectingPlayerToStealFrom) {
        for (var i = 0; i < players.length; i++) {
            // Make robbable players selectable.
            if (players[i]["AvailableToRob"]) {
                var boxId = "#playerBox" + (i + 1).toString();
                $(boxId).addClass("selectable");
            }
        }
    } else {
        // make no players selectable
        $(".player-float-box").removeClass("selectable");
    }

// TODO: Remove all event listeners from children before removing them.
    _boardSelectItemsContainer.removeAllChildren();
    _selectableItemsMap = {};

    // valid placement lists are only populated if needed.
    var validRoadPlacements = _currentGameManager["ValidRoadPlacements"];
    var validSettlementPlacements = _currentGameManager["ValidSettlementPlacements"];
    var validCityPlacements = _currentGameManager["ValidCityPlacements"];

    if (validRoadPlacements != null) {
        for (var i = 0; i < validRoadPlacements.length; i++) {
            var hexEdge = validRoadPlacements[i];
            var roadBitmap = createRoadBitmap(hexEdge, playerId);
            roadBitmap.mouseEnabled = true;
            roadBitmap.addEventListener("click", handleClickRoad);
            roadBitmap.addEventListener("mouseover", handleMouseOverSelectable);
            roadBitmap.addEventListener("mouseout", handleMouseOutSelectable);
            roadBitmap.alpha = 0.5; // Semi-transparent to indicate it's just a selection helper.
            _boardSelectItemsContainer.addChild(roadBitmap);

            _selectableItemsMap[hexEdge] = roadBitmap;
        }
    }
    if (validSettlementPlacements != null) {
        for (var i = 0; i < validSettlementPlacements.length; i++) {
            var hexPoint = validSettlementPlacements[i];
            var type = BuildingTypes.Settlement;

            var settlementBitmap = createBuildingBitmap(hexPoint, type, playerId);
            settlementBitmap.mouseEnabled = true;
            settlementBitmap.addEventListener("click", handleClickSettlement);
            settlementBitmap.addEventListener("mouseover", handleMouseOverSelectable);
            settlementBitmap.addEventListener("mouseout", handleMouseOutSelectable);
            settlementBitmap.alpha = 0.5; // Semi-transparent to indicate it's just a selection helper.
            _boardSelectItemsContainer.addChild(settlementBitmap);

            _selectableItemsMap[hexPoint] = settlementBitmap;
        }
    }
    if (validCityPlacements != null) {
        for (var i = 0; i < validCityPlacements.length; i++) {
            var hexPoint = validCityPlacements[i];
            var type = BuildingTypes.City;

            var cityBitmap = createBuildingBitmap(hexPoint, type, playerId);
            cityBitmap.mouseEnabled = true;
            cityBitmap.addEventListener("click", handleClickCity);
            cityBitmap.addEventListener("mouseover", handleMouseOverSelectable);
            cityBitmap.addEventListener("mouseout", handleMouseOutSelectable);
            cityBitmap.alpha = 0.5; // Semi-transparent to indicate it's just a selection helper.
            _boardSelectItemsContainer.addChild(cityBitmap);

            _selectableItemsMap[hexPoint] = cityBitmap;
        }
    }
}

function handleMouseOverSelectable(event) {
    var obj = event.target;
    obj.scaleX = 1.1;
    obj.scaleY = 1.1;
    obj.alpha = 0.7;
    _invalidateCanvas = true;
}
function handleMouseOutSelectable(event) {
    var obj = event.target;
    obj.scaleX = 1.0;
    obj.scaleY = 1.0;
    obj.alpha = 0.5;
    _invalidateCanvas = true;
}
function handleClickRoad(event) {
    if (event.nativeEvent.button !== 0)
        return;
    var obj = event.target;
    var hexEdge = selectableItemToHexKey(obj);
    if (hexEdge == null || _serverGameHub == null)
        return;

    _serverGameHub.selectRoad(hexEdge).done(function (result) {
        if (!result["Succeeded"]) { // failed. display error message.
            displayToastMessage(result["Message"]);
        }
    });
}
function handleClickSettlement(event) {
    if (event.nativeEvent.button !== 0)
        return;
    var obj = event.target;
    var hexPoint = selectableItemToHexKey(obj);
    if (hexPoint == null || _serverGameHub == null)
        return;

    _serverGameHub.selectBuilding(hexPoint, BuildingTypes.Settlement).done(function (result) {
        if (!result["Succeeded"]) { // failed. display error message.
            displayToastMessage(result["Message"]);
        }
    });
}
function handleClickCity(event) {
    if (event.nativeEvent.button !== 0)
        return;
    var obj = event.target;
    var hexPoint = selectableItemToHexKey(obj);
    if (hexPoint == null || _serverGameHub == null)
        return;

    _serverGameHub.selectBuilding(hexPoint, BuildingTypes.City).done(function (result) {
        if (!result["Succeeded"]) { // failed. display error message.
            displayToastMessage(result["Message"]);
        }
    });
}

function selectableItemToHexKey(item) {
    var keys = Object.keys(_selectableItemsMap);
    for (var i = 0; i < keys.length; i++) {
        var key = keys[i];
        if (_selectableItemsMap[key] === item)
            return key;
    }
    return null;
}

function populateResourceCards() {
    if (_currentGameManager == null)
        return;

    _cardContainer.removeAllChildren();
    _invalidateCardCanvas = true;

    var myPlayerId = _currentGameManager["MyPlayerId"];
    var playerTurnState = _currentGameManager["PlayerTurnState"];
    var player = getPlayerFromId(myPlayerId);
    if (player == null)
        return;

    var cards = player["ResourceCards"];
    var cardBitmaps = [];
    var resNames = ["Wood", "Brick", "Sheep", "Wheat", "Ore"];
    _selectedCards = [];
    for (var i = 0; i < resNames.length; i++) {
        var strRes = resNames[i];
        var resCount = cards[strRes];
        if (resCount != null && resCount > 0) {
            var asset = _assetMap["imgCard" + strRes];
            for (var j = 0; j < resCount; j++) {
                var bitmap = new createjs.Bitmap(asset.data);
                bitmap.name = strRes + j.toString();
                // If we have to select cards to lose, hook up the handlers
                if (playerTurnState === PlayerTurnState.AnyPlayerSelectingCardsToLose && player["CardsToLose"]> 0) {
                    bitmap.mouseEnabled = true;
                    bitmap.addEventListener("click", handleClickResCard);
                    bitmap.addEventListener("mouseover", handleMouseOverResCard);
                    bitmap.addEventListener("mouseout", handleMouseOutResCard);
                    _cardStage.enableMouseOver(20);
                } else {
                    bitmap.mouseEnabled = false;
                    _cardStage.enableMouseOver(0);
                }
                cardBitmaps.push(bitmap);
            }
        }
    }

    if (cardBitmaps.length === 0) {
        return;
    }

    // Add the cards to the stage. Center the cards and evenly space them.
    // Start to overlap when there are too many cards to fit in the canvas.
    var cardWidth = resourceCardHitbox.width;
    var cardHeight = resourceCardHitbox.height;
    var canvasWidth = _cardCanvas.width;
    var canvasHeight = _cardCanvas.height;
    var scale = canvasHeight / cardHeight;
    cardWidth *= scale;
    var spacing = cardWidth;
    if (cardBitmaps.length * cardWidth > canvasWidth) {
        // Too many cards. Start to overlap.
        spacing = (canvasWidth - cardWidth) / (cardBitmaps.length - 1);
    }
    for (var i = 0; i < cardBitmaps.length; i++) {
        var card = cardBitmaps[i];
        card.x = i * spacing;
        card.y = 0;
        card.scaleX = scale;
        card.scaleY = scale;
        if (spacing < cardWidth)
            card.shadow = new createjs.Shadow("#000000", -2, 3, 7);
        _cardContainer.addChild(card);
    }

    // Center the container in the stage
    var cb = _cardContainer.getBounds();
    _cardContainer.regX = cb.width / 2;
    _cardContainer.x = canvasWidth / 2;
}

function handleClickResCard(event) {
    if (event.nativeEvent.button !== 0)
        return;

    var obj = event.target;
    var name = obj.name;
    var itemIndex = _selectedCards.indexOf(name);
    if (itemIndex > -1) {
        // Already selected. Deselect.
        obj.y -= 30;
        _selectedCards.splice(itemIndex, 1);
    } else {
        // Not yet selected.
        obj.y += 30;
        _selectedCards.push(name);

        if (_currentGameManager != null) {
            // if we've selected the correct number of cards, submit.
            if (_selectedCards.length === getPlayerFromId(_currentGameManager["MyPlayerId"])["CardsToLose"]) {
                removeSelectedCards();
            }
        }
    }
    _invalidateCardCanvas = true;
}
function handleMouseOverResCard(event) {
    var obj = event.target;
    obj.filters = [new createjs.ColorFilter(1.2, 1.2, 1.2, 1, 0, 0, 0, 0)];
    obj.cache(0, 0, 500, 500);
    _invalidateCardCanvas = true;
}
function handleMouseOutResCard(event) {
    var obj = event.target;
    obj.filters = [];
    obj.updateCache();
    _invalidateCardCanvas = true;
}
function removeSelectedCards() {
    if (_serverGameHub == null)
        return;

    _serverGameHub.selectCardsToRemove(_selectedCards).done(function (result) {
        if (!result["Succeeded"]) { // failed. display error message.
            displayToastMessage(result["Message"]);
        }
    });
}

function populateBuyButtons() {
    if (_currentGameManager == null)
        return;

    var myPlayerId = _currentGameManager["MyPlayerId"];
    var player = getPlayerFromId(myPlayerId);
    if (player == null)
        return;

    var cards = player["ResourceCards"];
    var wood = cards["Wood"];
    var brick = cards["Brick"];
    var wheat = cards["Wheat"];
    var sheep = cards["Sheep"];
    var ore = cards["Ore"];

    if (wood >= 1 && brick >= 1) {
        $("#btnBuyRoad").removeClass("disabled");
    } else {
        $("#btnBuyRoad").addClass("disabled");
    }
    if (wood >= 1 && brick >= 1 && sheep >= 1 && wheat >= 1) {
        $("#btnBuySettlement").removeClass("disabled");
    } else {
        $("#btnBuySettlement").addClass("disabled");
    }
    if (wheat >= 2 && ore >= 3) {
        $("#btnBuyCity").removeClass("disabled");
    } else {
        $("#btnBuyCity").addClass("disabled");
    }
    if (sheep >= 1 && wheat >= 1 && ore >= 1) {
        $("#btnBuyDevelopmentCard").removeClass("disabled");
    } else {
        $("#btnBuyDevelopmentCard").addClass("disabled");
    }
}

//===========================
// Toast messages
//===========================

function displayToastMessage(str, time) {

    // remove any current message and invalidate canvas
    removeToastMessage();

    if (str == null || str === "")
        return;

    var text = new createjs.Text(str, "22px Arial", "#ffffff");
    text.lineWidth = _canvas.width - 50;
    var tr = text.getBounds();
    if (tr == null)
        return;

    var padding = 10;
    var graphics = new createjs.Graphics().beginFill("#000000").drawRect(tr.x - padding, tr.y - padding, tr.width + padding * 2, tr.height + padding * 2);
    var shape = new createjs.Shape(graphics);
    shape.alpha = 0.65;

    _toastMessageContainer.regX = (tr.width / 2) + padding;
    _toastMessageContainer.regY = (tr.height / 2) + padding;
    centerInCanvas(_toastMessageContainer);

    _toastMessageContainer.addChild(shape);
    _toastMessageContainer.addChild(text);

    if (time == null || time <= 0) {
        // automatically calculate the time to display, based on string length.
        time = (str.length * 60) + 1000;
    }
    // remove message after a time
    _toastMessageTimerId = setTimeout(removeToastMessage, time);
}

function removeToastMessage() {
    clearTimeout(_toastMessageTimerId);
    _toastMessageContainer.removeAllChildren();
    _invalidateCanvas = true;
}


//===========================
// Helper functions
//===========================

function getDictLength(dict) {
    return Object.keys(dict).length;
}

function getAssetKeyFromColor(assetPrefix, playerColor) {
    if (playerColor === PlayerColor.Blue) return assetPrefix + "Blue";
    if (playerColor === PlayerColor.Green) return assetPrefix + "Green";
    if (playerColor === PlayerColor.Red) return assetPrefix + "Red";
    if (playerColor === PlayerColor.Yellow) return assetPrefix + "Yellow";
    return assetPrefix;
}

function getPlayerFromId(playerId) {
    if (_currentGameManager == null)
        return null;

    var players = _currentGameManager["Players"];
    for (var i = 0; i < players.length; i++) {
        var player = players[i];
        if (player["Id"] === playerId) {
            return player;
        }
    }
    return null;
}

function getHexFromResourceTileBitmap(bitmap) {
    var hexKeys = Object.keys(_hexToResourceTileMap);
    for (var i = 0; i < hexKeys.length; i++) {
        var hexKey = hexKeys[i];
        var obj = _hexToResourceTileMap[hexKey];
        if (obj === bitmap) {
            return hexKey;
        }
    }
    return null;
}

function gethexAndDirectionFromEdge(hexEdge) {
    var hexes = hexEdgeToHexagons(hexEdge);
    var primaryHex = null;
    var otherHex = null;
    if (jQuery.inArray(hexes[0], _hexKeys) !== -1) {
        primaryHex = hexes[0];
        otherHex = hexes[1];
    } else {
        primaryHex = hexes[1];
        otherHex = hexes[0];
    }
    var primary = hexToValueArray(primaryHex);
    var other = hexToValueArray(otherHex);
    var x1 = primary[0]; var y1 = primary[1];
    var x2 = other[0]; var y2 = other[1];
    var direction = null;
    if (x2 === (x1 + 0) && y2 === (y1 + 1)) { direction = EdgeDir.TopLeft; }
    else if (x2 === (x1 + 1) && y2 === (y1 + 1)) { direction = EdgeDir.TopRight; }
    else if (x2 === (x1 + 1) && y2 === (y1 + 0)) { direction = EdgeDir.Right; }
    else if (x2 === (x1 + 0) && y2 === (y1 - 1)) { direction = EdgeDir.BottomRight; }
    else if (x2 === (x1 - 1) && y2 === (y1 - 1)) { direction = EdgeDir.BottomLeft; }
    else if (x2 === (x1 - 1) && y2 === (y1 + 0)) { direction = EdgeDir.Left; }
    return [primaryHex, direction];
}

// Returns a list of hexagons from a hexedge. (e.g. "[(-2,0),(-3,0)]" returns the list ["(-2,0)", "(-3,0)"])
function hexEdgeToHexagons(hexEdge) {
    var ob1 = hexEdge.indexOf("(", 0);
    var cb1 = hexEdge.indexOf(")", 0);
    var ob2 = hexEdge.indexOf("(", cb1 + 1);
    var cb2 = hexEdge.indexOf(")", cb1 + 1);
    var hex1 = hexEdge.slice(ob1, cb1 + 1);
    var hex2 = hexEdge.slice(ob2, cb2 + 1);
    var hexes = [hex1, hex2];
    return hexes;
}

// Returns a list of hexagons from a hexedge. (e.g. "[(-2,0),(-3,0),(-2,1)]" returns the list ["(-2,0)", "(-3,0)", "(-2,1)"])
function hexPointToHexagons(hexEdge) {
    var ob1 = hexEdge.indexOf("(", 0);
    var cb1 = hexEdge.indexOf(")", 0);
    var ob2 = hexEdge.indexOf("(", cb1 + 1);
    var cb2 = hexEdge.indexOf(")", cb1 + 1);
    var ob3 = hexEdge.indexOf("(", cb2 + 1);
    var cb3 = hexEdge.indexOf(")", cb2 + 1);
    var hex1 = hexEdge.slice(ob1, cb1 + 1);
    var hex2 = hexEdge.slice(ob2, cb2 + 1);
    var hex3 = hexEdge.slice(ob3, cb3 + 1);
    var hexes = [hex1, hex2, hex3];
    return hexes;
}

// Returns a [x,y] coordinate from a hex point "[(x1,y1),(x2,y2),(x3,y3)]"
function hexPointToCoordinates(hexPoint) {
    var hexagons = hexPointToHexagons(hexPoint);

    // Find the stage offsets for hex coordinates. TODO: Move to init function
    var center = _hexToBeachMap["(0,0)"];
    var right = _hexToBeachMap["(1,0)"];
    var bottom = _hexToBeachMap["(0,1)"];
    var xOffsets = [right.x - center.x, right.y - center.y];
    var yOffsets = [bottom.x - center.x, bottom.y - center.y];

    var avgX = 0;
    var avgY = 0;
    for (var i = 0; i < hexagons.length; i++) {
        var h = hexToValueArray(hexagons[i]);
        var stageX = center.x + (h[0] * xOffsets[0]) + (h[1] * yOffsets[0]);
        var stageY = center.y + (h[0] * xOffsets[1]) + (h[1] * yOffsets[1]);
        avgX += stageX;
        avgY += stageY;
    }
    avgX = avgX / hexagons.length;
    avgY = avgY / hexagons.length;
    return [avgX, avgY];
}

// returns a [x,y] number array from a "(x,y)" string
function hexToValueArray(hex) {
    var strX = hex.slice(1, hex.indexOf(","));
    var strY = hex.slice(hex.indexOf(",") + 1, hex.indexOf(")"));
    var x = parseInt(strX);
    var y = parseInt(strY);
    return [x, y];
}

function resourceToColor(resource) {
    if (resource === ResourceTypes.Brick)
        return "red";
    if (resource === ResourceTypes.None)
        return "black";
    if (resource === ResourceTypes.Ore)
        return "grey";
    if (resource === ResourceTypes.Sheep)
        return "green";
    if (resource === ResourceTypes.Wheat)
        return "yellow";
    if (resource === ResourceTypes.Wood)
        return "#050";
    return "white";
}

// Makes a string safe for insertion into html.
function encodeForHtml(str) {
    return $("<span />").text(str).html();
}

function getProbabilityFromRoll(roll) {
    if (roll < 2 || roll > 12) return 0;
    switch (roll) {
        case 2:
        case 12:
            return 1;
        case 3:
        case 11:
            return 2;
        case 4:
        case 10:
            return 3;
        case 5:
        case 9:
            return 4;
        case 6:
        case 8:
            return 5;
        case 7:
            return 6;
        default:
            return 0;
    }
}