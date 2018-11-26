const fs = require('fs');
const path = require('path');

const crawl = {};

crawl.listContents = absoluteDirPath => new Promise((resolve, reject) => {
  fs.readdir(absoluteDirPath, function(err, contents){
    if (!err) {
      resolve(contents);
    } else {
      reject(err);          
    }
  })
});

crawl.isDirectory = absolutePath => new Promise((resolve, reject) => {
  fs.stat(absolutePath, (err, stats) => {
    if (err) {
      reject(err);
    } else {
      resolve(stats.isDirectory());
    }
  })
});

crawl.crawlDir = async (absolutePath, onFileCallback = null, onDirCallback = null, options = null) => {
  const crawlOptionDefaults = {awaitCallbacks: true, parentBeforeChild: false, pathKeys: false};

  // Overwrite defaults only with those options that were provided
  options = {...crawlOptionDefaults, ...options};

  const isDirectory = await crawl.isDirectory(absolutePath);
  if (!isDirectory) {
    if (onFileCallback !== null){
      if (options.awaitCallbacks) {
        await onFileCallback(absolutePath);
      } else {
        onFileCallback(absolutePath);
      }
    }
    return null;
  } else {
    const contents = await crawl.listContents(absolutePath);
    if (onDirCallback !== null && options.parentBeforeChild){
      if (options.awaitCallbacks){
        await onDirCallback(absolutePath);
      } else {
        onDirCallback(absolutePath);
      }
    }
    const dirObj = {};
    const allPromise = await Promise.all(contents.map(async each => {
      const pathToEach = path.join(absolutePath, each);
      const inner = await crawl.crawlDir(pathToEach, onFileCallback, onDirCallback, options);
      if (!options.pathKeys){
        dirObj[path.basename(pathToEach)] = inner;
      } else {
        dirObj[pathToEach] = inner;
      }
    }));
    if (onDirCallback !== null && !options.parentBeforeChild){
      if (options.awaitCallbacks){
        await onDirCallback(absolutePath);
      } else {
        onDirCallback(absolutePath);
      }
    }
    return dirObj;
  }
};

crawl.crawlDirObj = async (obj, onParentCallback = null, onChildCallback = null, options = null) => {
  const crawlOptionDefaults = {
    awaitCallbacks: true, 
    parentBeforeChild: false, // not yet used in this function
    afterDir: () => Promise.resolve(), 
    awaitAfterDepth: true //true
  };
  options = {...crawlOptionDefaults, ...options};
  const fileChildren = [];
  const dirChildren = [];
  for(let key in obj){
    if (obj[key] === null){
      fileChildren.push(key);
    } else {
      dirChildren.push(key);
    }
  }
  if (fileChildren.length > 0){
    for(let fileChild of fileChildren){
      if (options.awaitCallbacks){
        await onChildCallback(fileChild, options);
      } else {
        onChildCallback(fileChild, options);
      }
    }
  }
  if (dirChildren.length > 0){
    for(let dirChild of dirChildren){
      if (options.awaitCallbacks){
        await onParentCallback(dirChild, options);
      } else {
        onParentCallback(dirChild, options);
      }
      await crawl.crawlDirObj(obj[dirChild], onParentCallback, onChildCallback, options)
    }
  }
  if (options.awaitAfterDepth) {
    await options.afterDir(options);
  } else {
    options.afterDir(options);
  }
  return Promise.resolve();
};


crawl.objToDir = (obj, basePath) => new Promise((resolve, reject) => {
  let runningPath = path.join(basePath);

  if (!path.isAbsolute(runningPath)){
    reject(`ERR: Path argument is not absolute`);
  }

  const onDirCallback = (res, options) => new Promise((resolve, reject) => {
    const pathName = path.join(runningPath, res);
    fs.mkdir(pathName, err => {
      runningPath = path.join(runningPath, res);
      if (!err) {
        resolve();
      }
      else {
        console.log(`ERR making dir ${pathName}`);
        reject(err)
      };
    })
  });
  const onFileCallback = (res, options) => new Promise((resolve, reject) => {
    const filePath = path.join(runningPath, res);
    fs.writeFile(filePath, '', err => {
      if (!err) {
        resolve();
      }
      else {
        console.log(`ERR writing: ${filePath}`);
        reject(err);
      }
    })
  });
  const afterDir = () => new Promise((resolve, reject) => {
    runningPath = path.join(runningPath, '../');
    resolve();
  })

  crawl.crawlDirObj(obj, onDirCallback, onFileCallback, {awaitCallbacks: true, afterDir: afterDir, awaitAfterDepth: true})
  .then(() => {
    resolve();
  })
  .catch(err => {
    console.log(err);
  })
});


crawl.dirToObj = (absDirPath, pathKeys = false) => new Promise((resolve, reject) => {
  crawl.crawlDir(absDirPath, null, null, {pathKeys: pathKeys})
  .then(obj => resolve(obj))
  .catch(err => reject(err));
});

// TODO: option to find without file extension in name or using Regex;
// WARNING: operation might be very expensive and slow.
// Find way to kill process after fileName has been found
/* crawl.findFilename = (fileName, dirToCrawl) => new Promise((resolve, reject) => {
  if (!path.isAbsolute(dirToCrawl)){
    reject(`ERR: path ${dirToCrawl} is not absolute`);
    return;
  }
  const checkFileName = absPathReached => {

  }
  ///crawl.crawlDir()
  
}) */

/* MORE TODO: */
/* 
--> crawl.findDirname()

--> crawl.tree() to pretty-print contents of directory
*/

/* TODO: crawl.copyToMany(fromPath, toPaths: path[]) */

crawl.tree = pathToDir => {
}

/* Copies folders and files from one path to another but all files are empty */
crawl.copyEmptyStructure = (fromPath, toPath) => new Promise((resolve, reject) => {
  crawl.dirToObj(fromPath)
  .then(dirObj => {
    crawl.objToDir(dirObj, toPath)
    .then(() => resolve())
  })
  .catch(err => reject(err));
});

/* 
WARNING: does not copy directory metadata, but does so for files at it copies using fs.copyFile behavior.
*/
crawl.copy = (fromPath, toPath) => new Promise((resolve, reject) => {
  fromPath = path.normalize(fromPath);
  toPath = path.normalize(toPath);

  crawl.dirToObj(fromPath, false)
  .then(dirObject => {
    newDirObj = {};
    newDirObj[path.basename(fromPath)] = dirObject;
    crawl._copyController(newDirObj, fromPath, {toPath: toPath} )
    .then(() => {
      resolve();
    })
    .catch(err => {
      reject(err);
    })
  })
  .catch(err => {
    reject(err);
  })
});

crawl.copyOneToMany = (fromPath, destinationsArray) => new Promise((resolve, reject) => {
  fromPath = path.normalize(fromPath);
  const toPathsObj = {};
  let _i = 0;
  for(let dest of destinationsArray){
    toPathsObj[_i++] = dest;
  }

  crawl.dirToObj(fromPath, false)
  .then((obj) => {
    crawl._copyController(obj, fromPath, toPathsObj)
    .then(() => {
      resolve();
    })
    .catch(err => {
      reject(err);
    })
  })
});

crawl._crawlDirObjController = (obj, onDirCallback = null, onFileCallback = null, options = null) => new Promise((resolve, reject) => {
  /* 
    NOTE: trackDepth will receive an object with keys poiting to different paths that will be reassigned to new paths 
    resolved to look as if we were crawling the `obj` inside these paths as the crawler changes depth. The updated paths
    will be sent to both onDirCallback and onFileCallback after resolution for use.
  */
  const defaultControllerOptions = { awaitAfterDepth: true , trackDepth: null, afterDir: null};
  options = {...defaultControllerOptions, ...options};

  const _relativizePaths = (optionsDepthObj, basePath = '', addOrSub = 'add') => { //addOrSub: 'add' | 'sub';
    for(let singlePath in optionsDepthObj){
      let newPath;
      if (addOrSub === 'add'){
        newPath = path.join(optionsDepthObj[singlePath], basePath);
      } else if (addOrSub === 'sub'){
        newPath = path.join(optionsDepthObj[singlePath], '../');
      }
      optionsDepthObj[singlePath] = newPath;
    }
    // no need to return as optionsDepthObj is passed by reference
  }

  const _onDirCallback = (res, options) => new Promise((resolve, reject) => {
    if (options.trackDepth !== null){
      _relativizePaths(options.trackDepth, res);
    }
    if (onDirCallback !== null) {
      onDirCallback(res, options)
      .then(() => {
        resolve();
      })
      .catch(err => {
        reject(err);
      })
    } else {
      resolve();
    }
  });

  const _onFileCallback = (res, options) => new Promise((resolve, reject) => {
    if (options.trackDepth !== null){
      _relativizePaths(options.trackDepth, res);
    }
    if (onFileCallback !== null){
      onFileCallback(res, options)
      .then(() => {
        if (options.trackDepth !== null){
          _relativizePaths(options.trackDepth, '', 'sub'); // remove the basename, which is the name of the file
        }
        resolve();
      })
      .catch(err => reject(err));
    } else {
      if (options.trackDepth !== null){
        _relativizePaths(options.trackDepth, '', 'sub');
      }
      resolve();
    }
  });

  const _afterDir = () => new Promise((resolve, reject) => {
    if (options.trackDepth !== null){
      _relativizePaths(options.trackDepth, '', 'sub');
    }
    if (options.afterDir !== null){
      options.afterDir(options)
      .then(() => {
        resolve();
      })
      .catch(err => {
        reject(err);
      });
    } else {
      resolve();
    }
  })

  crawl.crawlDirObj(obj, _onDirCallback, _onFileCallback, {...options, afterDir: _afterDir})
  .then(() => {
    console.log(`Resolved _crawlDirObjController`);
    resolve();
  })
  .catch(err => {
    console.log(`Rejected _crawlDirObjController`);
    reject(err);
  })
})

crawl._copyController = (obj, fromPath, toPathsObj) => new Promise((resolve, reject) => {
  let runningFromPath = path.join(fromPath); // goes back one level to accout for having added the new dir to toPath

  const optionsObj = {
    trackDepth: {
      runningFromPath: runningFromPath,
      ...toPathsObj
    },
    awaitCallbacks: true, 
    awaitAfterDepth: true
  }

  const onDirCallback = (res, options) => new Promise((resolve, reject) => {
    const keys = Object.keys(options.trackDepth);
    const throughAll = Promise.all(keys.map(singlePathVar => new Promise((resolve, reject) => {
      if (options.trackDepth[singlePathVar] === options.trackDepth.runningFromPath){
        return resolve();
      }
      fs.mkdir(options.trackDepth[singlePathVar], err => {
        if (!err){
          resolve();
        } else {
          reject(err);
        }
      })
    })))
    throughAll.then(() => {
      resolve();
    })
    .catch(err => reject(err));
  });
  const onFileCallback = (res, options) => new Promise((resolve, reject) => {
    const keys = Object.keys(options.trackDepth);
    const throughAll = Promise.all(keys.map(singlePathVar => new Promise((resolve, reject) => {
      if (options.trackDepth[singlePathVar] === options.trackDepth.runningFromPath){
        return resolve();
      }
      fs.copyFile(options.trackDepth.runningFromPath, options.trackDepth[singlePathVar], err => {
        if (!err){
          resolve();
        } else {
          reject(err);
        }
      })
    })));
    throughAll.then(() => {
      resolve();
    })
    .catch(err => {
      reject(err);
    });
  });
  
  crawl._crawlDirObjController(obj, onDirCallback, onFileCallback, optionsObj)
  .then(() => {
    resolve();
  })
  .catch(err => {
    console.log(err);
  })
});

crawl.removeMany = (absPathsArray, options) => new Promise((resolve, reject) => {
  const allPromises = Promise.all(absPathsArray.map(absPath => new Promise((resolve, reject) => {
    crawl.remove(absPath, options)
    .then(() => {
      resolve();
    })
    .catch(err => {
      reject(err);
    })
  })));
  allPromises
  .then(() => {
    resolve();
  })
  .catch(err => {
    reject(err);
  })
})

crawl.remove = (absPath, options) => new Promise((resolve, reject) => {
  const dirFoundPathCallback = dirFoundPath => new Promise((resolve, reject) => {
    fs.rmdir(dirFoundPath, err => {
      if (err){
        console.log(`ERR: [crawl] could not remove ${dirFoundPath}`)
        reject(err);
      } else {
        resolve();
      }
    })
  });

  const fileFoundPathCallback = fileFoundPath => new Promise((resolve, reject) => {
    fs.unlink(fileFoundPath, err => {
      if (err){
        console.log(`ERR: [crawl] could not unlink ${fileFoundPath}`);
        reject(err);
      } else {
        resolve();
      }
    })
  });

  crawl.crawlDir(absPath, fileFoundPathCallback, dirFoundPathCallback, options)
  .then(nonExistentDirObj => {
    return resolve();
  })
  .catch(err => {
    reject(err)
  })
});

module.exports = crawl;