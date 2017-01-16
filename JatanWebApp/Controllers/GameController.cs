﻿using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Web;
using System.Web.Mvc;
using JatanWebApp.Models.ViewModels;
using JatanWebApp.SignalR;
using Microsoft.AspNet.Identity;

namespace JatanWebApp.Controllers
{
    [Authorize]
    public class GameController : BaseController
    {
        // GET: Game
        public ActionResult Index()
        {
            return RedirectToAction("Join");
        }

        // Get: Game/Create
        public ActionResult Create()
        {
            var userName = User.Identity.Name;
            var defaultGameName = string.Format("{0}'s game", userName);

            return View(new CreateGameViewModel() { DisplayName = defaultGameName });
        }

        // Post: Game/Create
        [HttpPost]
        [ValidateAntiForgeryToken]
        public ActionResult Create(CreateGameViewModel viewModel)
        {
            if (!ModelState.IsValid)
            {
                return View(viewModel);
            }

            var userName = User.Identity.Name;
            var lobby = GameLobbyManager.CreateNewGame(userName, viewModel);

            return RedirectToAction("Instance", new { gameId = lobby.Uid });
        }

        // Get: Game/Join
        public ActionResult Join(string gameId, string password)
        {
            if (!string.IsNullOrEmpty(gameId))
            {
                var lobby = GameLobbyManager.GetGameLobbyFromUid(gameId);
                if (lobby != null)
                {
                    var userName = User.Identity.Name;
                    var result = GameLobbyManager.ConnectToGame(userName, lobby.Owner, password);
                    if (result.Succeeded)
                        return RedirectToAction("Instance", new {gameId = gameId});

                    return View(new JoinGameViewModel() {ErrorMessage = result.Message});
                }
                return View(new JoinGameViewModel() { ErrorMessage = "This game does not exist." });
            }

            return View(new JoinGameViewModel());
        }

        // Get: Game/Instance/id
        public ActionResult Instance(string gameId)
        {
            if (!string.IsNullOrEmpty(gameId))
            {
                var lobby = GameLobbyManager.GetGameLobbyFromUid(gameId);
                if (lobby != null)
                {
                    var userName = User.Identity.Name;
                    if (lobby.Players.Contains(userName))
                        return View();

                    return new HttpStatusCodeResult(HttpStatusCode.Unauthorized);
                }
            }
            return new HttpStatusCodeResult(HttpStatusCode.NotFound);
        }

    }
}